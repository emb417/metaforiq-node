import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { JSONFilePreset } from 'lowdb/node'
import pino from 'pino';
import cron from 'node-cron';
import nodemailer from 'nodemailer';

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

// Schedule the execution of on order every day at noon
cron.schedule('0 12 * * *', () => {
  scrapeItems(onOrderConfig);
});

// Set up database
const db = await JSONFilePreset('db.json',{ libraryItems: [], wishListItems: [] });
await db.read();

function sendEmail(message) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.MAIL_FROM,
      pass: process.env.MAIL_PASSWORD,
      clientId: process.env.OAUTH_CLIENTID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      refreshToken: process.env.OAUTH_REFRESH_TOKEN
    }
  });

  let mailOptions = {
    from: process.env.MAIL_FROM,
    to: process.env.MAIL_TO,
    subject: '',
    text: ''
  };

  mailOptions = { ...mailOptions, ...message };

  transporter.sendMail(mailOptions, function(err, data) {
    if (err) {
      logger.error(err);
    } else {
      logger.info("email sent.");
    }
  });
}

// Scraper utils
const locations = [
  { code: 9, name: 'Beaverton City Library' },
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
    logger.info(`scraping ${config.type} items...`);
    logger.debug(`clearing ${filterItemsByType(config.type).length} ${config.type} items...`);
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
        description: item.briefInfo.description,
        url: `https://wccls.bibliocommons.com/v2/record/${item.id}`
      });
    }
    await db.write();
    logger.debug(`${filterItemsByType(config.type).length} ${config.type} items saved.`);
    let filteredWishListItems, messageText = [];

    if(config.type === 'available now'){
      // filter items based on wish list and send email if there are any
      filteredWishListItems = filterItemsByType(config.type)
        .filter(item => db.data.wishListItems.some(wishListItem => item.title.toLowerCase().includes(wishListItem.toLowerCase())));

      logger.info(`found ${filteredWishListItems.length} wish list items ${config.type}.`);
      if(filteredWishListItems.length !== 0){
        logger.info(`sending email for ${filteredWishListItems.length} ${config.type} items...`);
      
        for (const item of filteredWishListItems) {
          const response = await fetch(availabilityUrl(item.id));
          const data = await response.text();
          const bibItemsData = JSON.parse(data).entities.bibItems;
          logger.trace(bibItemsData);

          const availableBibItems = Object.values(bibItemsData).filter(bibItem => bibItem.availability.status === 'AVAILABLE');
          const availableLocations = availableBibItems
            .filter(bibItem => locations.some(location => location.name === bibItem.branch.name))
            .map(bibItem => bibItem.branch.name);

          const dbItem = db.data.libraryItems.find(libraryItem => libraryItem.id === item.id);
          dbItem.locations = availableLocations;
          await db.write();

          messageText.push(`${item.title} :: ${item.url} :: available at ${item.locations.join(', ')}`);
        }
      }
    }
    else if (config.type === 'on order'){
      for (const item of db.data.libraryItems.filter(libraryItem => libraryItem.type === 'on order')) {
        messageText.push(`${item.title} :: ${item.url}`);
      }
    }

    logger.debug(messageText);
    if (messageText.length > 0) {
      const message = {
        subject: `Alert: ${config.type}`,
        text: `${messageText.join('\n\n')}`,
      };
      logger.debug(message);
      sendEmail(message);
    }

    return config.type === 'on order' 
    ? db.data.libraryItems.filter(item => item.type === 'on order')
    : filteredWishListItems;
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
  // TODO add validation if item is not in wish list, possibly return list of items in wish list
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
logger.info(`server listening at http://localhost:${port}`);
});