import express from 'express';
import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { JSONFilePreset } from 'lowdb/node'
import pino from 'pino';
import cron from 'node-cron';

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
cron.schedule('*/15 10-17 * * *', () => {
  scrapeItems(availableConfig);
});

// Schedule the execution of on order every day at noon
cron.schedule('0 12 * * *', () => {
  scrapeItems(onOrderConfig);
});

// Set up database
const db = await JSONFilePreset('db.json',{ libraryItems: [], wishListItems: [] });
await db.read();

// Scraper configs
const availableConfig = {
  type: 'available now',
  fetchUrl: 'https://wccls.bibliocommons.com/v2/search?custom_edit=false&query=anywhere%3A(%5B0%20TO%20180%5D)%20%20%20avlocation%3A%22Beaverton%20Murray%20Scholls%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&f_STATUS=39&f_NEWLY_ACQUIRED=PAST_180_DAYS',
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]'
};

const onOrderConfig = {
  type: 'on order',
  fetchUrl: 'https://wccls.bibliocommons.com/v2/search?query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS',
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]'
};


// Scraper
const scrapeItems = async (config) => {
  try {
    logger.info(`scraping ${config.type} items...`);
    logger.debug(`clearing ${db.data.libraryItems.filter(item => item.type === config.type).length} ${config.type} items...`);
    db.data.libraryItems = db.data.libraryItems.filter(item => item.type !== config.type);
    await db.write();

    logger.debug(`getting ${config.type} items...`);
    const response = await fetch(config.fetchUrl);
    const data = await response.text();
    
    logger.debug(`parsing ${config.type} items...`);
    const $ = cheerioLoad(data);
    const script = $(config.scriptValue).text();
    const scriptData = JSON.parse(script);

    logger.debug(`saving ${config.type} items...`);
    for (const itemId in scriptData.entities.bibs) {
      const item = scriptData.entities.bibs[itemId];
      db.data.libraryItems.push({
        id: item.id,
        type: config.type,
        title: item.briefInfo.title,
        subtitle: item.briefInfo.subtitle,
        publicationDate: item.briefInfo.publicationDate,
        format: item.briefInfo.format,
        edition: item.briefInfo.edition,
        description: item.briefInfo.description
      });
    }
    await db.write();
    logger.debug(`${db.data.libraryItems.filter(item => item.type === config.type).length} ${config.type} items saved.`);

    const filteredItems = db.data.libraryItems.filter(item => db.data.wishListItems.some(wishListItem => item.title.toLowerCase().includes(wishListItem.toLowerCase())));
    if (filteredItems.length === 0) {
        logger.info(`no wish list items ${config.type}.`);
      } else {
        logger.info(
          `wish list items ${config.type}: ${filteredItems.map(item => item.title).join(', ')}.`
        );
      }
    return filteredItems;
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

app.get('/add-to-wish-list/:keywords', async (req, res) => {
  db.data.wishListItems.push(req.params.keywords);
  await db.write();
  res.send(`Added ${req.params.keywords} to wish list.`);
});

app.get('/remove-from-wish-list/:keywords', async (req, res) => {
  db.data.wishListItems = db.data.wishListItems.filter(item => item.toLowerCase() !== req.params.keywords.toLowerCase());
  await db.write();
  res.send(`Removed ${req.params.keywords} from wish list.`);
});

app.get('/wish-list', async (req, res) => {
  res.send(db.data.wishListItems);
});

app.get('*', (req, res) => {
  logger.info( `The Dude does not abide!` );
  res.send( `The Dude does not abide!` );
});

// Start server
app.listen(port, () => {
console.log(`Server listening at http://localhost:${port}`);
});