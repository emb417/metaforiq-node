import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { JSONFilePreset } from 'lowdb/node'
import pino from 'pino';
import cron from 'node-cron';
import scrapeItems, { filterItemsByType } from './scrape.js';

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

const availableConfig = {
  type: 'available now',
  fetchUrl: 'https://wccls.bibliocommons.com/v2/search?custom_edit=false&query=anywhere%3A(%5B0%20TO%20180%5D)%20%20%20avlocation%3A%22%5B*%20TO%20*%5D%22%20collection%3A%22Best%20Sellers%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&f_STATUS=9%7C39%7C29%7C31&f_NEWLY_ACQUIRED=PAST_180_DAYS&locked=true',
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]'
};

const onOrderConfig = {
  type: 'on order',
  fetchUrl: 'https://wccls.bibliocommons.com/v2/search?query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS',
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]'
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
    const listItems = db.data.wishListItems.length === 0 ? 'empty' : db.data.wishListItems.join(', ');
    res.status(404).send(`${req.params.keywords} not found in wish list. Wish list items are ${listItems}.`);
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