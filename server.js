import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { JSONFilePreset } from 'lowdb/node'
import pino from 'pino';
import cron from 'node-cron';
import discord from 'discord.js';

const app = express();
const port = 8008;

// Set up logging
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Schedule the execution of available now every 15 minutes from 10:00am to 6:00pm
cron.schedule('0,15,30,45 10-18 * * *', () => {
  scrapeItems(availableConfig);
});

// Schedule the execution of on order every day at noon and 6pm
cron.schedule('0 12,18 * * *', () => {
  scrapeItems(onOrderConfig);
});

// Set up database
const __dirname = path.resolve();
const dbPath = path.join(__dirname, 'db.json');

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '{ "libraryItems": [], "wishListItems": [] }');
}

const db = await JSONFilePreset('db.json',{});
await db.read();

function sendDiscordNotification(content) {
  const webhookClient = new discord.WebhookClient({ 'url': process.env.DISCORD_WEBHOOK_URL });
  webhookClient.send({ content: content })
      .then(() => logger.info('Discord notification sent!'))
      .catch((error) => logger.error('Failed to send Discord notification:', error));
}

// Scraper utils
const locations = [
  // { code: 9, name: 'Beaverton City Library' },
  { code: 29, name: 'Tigard Public Library' },
  { code: 31, name: 'Tualatin Public Library' },
  { code: 39, name: 'Beaverton Murray Scholls' }
];

const availableConfig = {
  type: 'available now',
  fetchUrl: 'https://wccls.bibliocommons.com/v2/search?custom_edit=false&query=anywhere%3A(%5B0%20TO%20180%5D)%20%20%20avlocation%3A%22%5B*%20TO%20*%5D%22%20collection%3A%22Best%20Sellers%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&f_STATUS=9%7C39%7C29%7C31&f_NEWLY_ACQUIRED=PAST_180_DAYS&locked=true',
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]'
};

const availabilityUrl = (itemId) => {
  return `https://gateway.bibliocommons.com/v2/libraries/wccls/bibs/${itemId}/availability?locale=en-US`;
};

const onOrderConfig = {
  type: 'on order',
  fetchUrl: 'https://wccls.bibliocommons.com/v2/search?query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS',
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]'
};

function filterItemsByType(type) {
  return db.data.libraryItems.filter(item => item.type === type);
}

// Scraper
const scrapeItems = async (config) => {
  try {
    logger.info(`getting ${config.type} items...`);
    const response = await fetch(config.fetchUrl);
    const data = await response.text();
    
    logger.debug(`parsing ${config.type} items...`);
    const $ = cheerioLoad(data);
    const script = $(config.scriptValue).text();
    const scriptData = JSON.parse(script);

    logger.debug(`updating ${config.type} items...`);
    for (const itemId in scriptData.entities.bibs) {
      const item = scriptData.entities.bibs[itemId];
      const existingItem = db.data.libraryItems.find(libraryItem => libraryItem.id === itemId);
      if (existingItem) {
        existingItem.updateDate = Math.floor(Date.now() / 1000);
      } else {
        db.data.libraryItems.push({
          id: item.id,
          type: config.type,
          title: item.briefInfo.title,
          subtitle: item.briefInfo.subtitle,
          publicationYear: item.briefInfo.publicationDate,
          format: item.briefInfo.format,
          edition: item.briefInfo.edition,
          description: item.briefInfo.description,
          url: `https://wccls.bibliocommons.com/v2/record/${item.id}`,
          createDate: Math.floor(Date.now() / 1000),
          updateDate: Math.floor(Date.now() / 1000)
        });
      }
    }
    // Filter out any items that haven't been updated in the past 7 days
    db.data.libraryItems = db.data.libraryItems.filter(
      item =>
        Math.floor(Date.now() / 1000) - item.updateDate <= 7 * 24 * 60 * 60
    );
    await db.write();
    logger.debug(`${filterItemsByType(config.type).length} ${config.type} items updated.`);
    
    let filteredWishListItems = [], availableWishListItems = [], messageText = [];
    if(config.type === 'available now'){
      filteredWishListItems = filterItemsByType(config.type)
        .filter(item => db.data.wishListItems.some(wishListItem => item.title.toLowerCase().includes(wishListItem.toLowerCase())));

      if(filteredWishListItems.length !== 0){
        logger.info(`getting availability for ${filteredWishListItems.length} ${config.type} wish list items...`);
        for (const item of filteredWishListItems) {
          logger.debug(`\n############################ ${item.title} ############################`);
          const response = await fetch(availabilityUrl(item.id));
          const data = await response.text();
          const bibItemsData = JSON.parse(data).entities.bibItems;
          logger.debug(`parsing ${Object.values(bibItemsData).length} ${config.type} bibItems...`);
          logger.trace(bibItemsData);

          const availableBibItems = Object.values(bibItemsData).filter(bibItem => bibItem.availability.status === 'AVAILABLE' &&
            bibItem.collection.endsWith('Not Holdable') &&
            !bibItem.callNumber.startsWith('4K'));
          logger.debug(`filtered down to ${availableBibItems.length} AVAILABLE, NOT HOLDABLE, NOT 4K bibItems...`);
          logger.trace(availableBibItems);

          if (availableBibItems.length > 0) {
            for (const bibItem of availableBibItems) {
              const location = locations.find(location => location.name === bibItem.branch.name);
              if (location) {
                const dbItem = db.data.libraryItems.find(libraryItem => libraryItem.id === item.id);
                if (!dbItem.availability) {
                  dbItem.availability = {};
                }
                if (!dbItem.availability[location.code]) {
                  dbItem.availability[location.code] = {};
                }
                if (!dbItem.availability[location.code].notifyDate || new Date(dbItem.availability[location.code].notifyDate * 1000) < new Date(Date.now() - process.env.NOTIFY_DELAY)) {
                  dbItem.availability[location.code].notifyDate = Math.floor(Date.now() / 1000);
                  dbItem.availability[location.code].location = location.name;
                  availableWishListItems.push(dbItem);
                  await db.write();
                  logger.debug(`db availability location updated: ${dbItem.availability[location.code].location}.`);

                  messageText.push(`${item.title}\n${location.name}\n${item.url}`);
                }
              }
            }
          }
        }
      }
    }
    else if (config.type === 'on order'){
      for (const item of db.data.libraryItems.filter(libraryItem => libraryItem.type === 'on order' && !libraryItem.notifyDate)) {
        messageText.push(`${item.title}\n${item.url}`);
        item.notifyDate = Math.floor(Date.now() / 1000);
        await db.write();
      }
    }

    if (messageText.length > 0) {
      const message = `${config.type} alert!!!\n\n${messageText.join('\n\n')}`;

      logger.info(`sending notification for ${messageText.length} ${config.type} items...`);
      logger.trace(messageText);
      sendDiscordNotification(message);
    } else {
      logger.info(`no items ${config.type}.`);
    }

    return config.type === 'on order' 
    ? db.data.libraryItems.filter(item => item.type === 'on order')
    : availableWishListItems;
  } catch (error) {
    logger.error(error);
    throw new Error(`Server Error - Check Logs`);
  }
};

// Request handler
const itemsHandler = async (req, res, config) => {
  try {
    const items = await scrapeItems(config);
    if (items.length === 0) {
      res.send(`No wish list items ${config.type}.`);
    } else {
      res.send(items);
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
}

// App routes
app.get('/on-order', async (req, res) => {
  await itemsHandler(req, res, onOrderConfig);
});

app.get('/available-now', async (req, res) => {
  await itemsHandler(req, res, availableConfig);
});

app.get('/all-best-sellers', async (req, res) => {
  const items = filterItemsByType('available now');
  logger.info(`found ${items.length} best seller items.`);
  res.send(items);
});

app.get('/all-on-order', async (req, res) => {
  const items = filterItemsByType('on order');
  logger.info(`found ${items.length} on order items.`);
  res.send(items);
});

app.get('/add-to-wish-list/:keywords', async (req, res) => {
  db.data.wishListItems.push(req.params.keywords);
  await db.write();
  logger.info(`added ${req.params.keywords} to wish list.`);
  res.send(`Added ${req.params.keywords} to wish list.`);
});

app.get('/remove-from-wish-list/:keywords', async (req, res) => {
  const index = db.data.wishListItems.findIndex(item => item.toLowerCase() === req.params.keywords.toLowerCase());
  if (index === -1) {
    res.status(404).send(`${req.params.keywords} not found in wish list. Wish list items are: ${db.data.wishListItems.join(', ')}.`);
  } else {
    db.data.wishListItems.splice(index, 1);
    await db.write();
    logger.info(`removed ${req.params.keywords} from wish list.`);
    res.send(`Removed ${req.params.keywords} from wish list.`);
  }
});

app.get('/wish-list', async (req, res) => {
  logger.info(`sending wish list.`);
  res.send(db.data.wishListItems);
});

app.get('*', (req, res) => {
  logger.info( `The Dude does not abide!` );
  res.send( `The Dude does not abide!` );
});

// Start server
app.listen(port, () => {
logger.info(`server listening at http://localhost:${port}`);
});