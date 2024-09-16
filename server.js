import "dotenv/config";
import fs from "fs";
import path from "path";
import express from "express";
import { JSONFilePreset } from "lowdb/node";
import pino from "pino";
import cron from "node-cron";
import auth from "./authHandler.js";
import { availableConfig, onOrderConfig } from "./configs.js";
import scrapeItems from "./scraper.js";

const app = express();
const port = 8008;

// Set up logging
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

// Schedule the execution of available now every 15 minutes from 10:00am to 6:00pm
cron.schedule("0,15,30,45 10-18 * * *", () => {
  scrapeItems(availableConfig);
});

// Schedule the execution of on order every day at noon and 6pm
cron.schedule("0 12,18 * * *", () => {
  scrapeItems(onOrderConfig);
});

// Set up database
const __dirname = path.resolve();
const dbPath = path.join(__dirname, "db.json");

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '{ "libraryItems": [], "wishListItems": [] }');
}

const db = await JSONFilePreset("db.json", {});
await db.read();

function filterItemsByType(type) {
  return db.data.libraryItems.filter((item) => item.type === type);
}

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
};

// Middleware
app.use(express.json()); // for parsing application/json

// Routes
app.post("/auth", (req, res) => {
  auth(req, res);
});

app.get("/on-order", async (req, res) => {
  await itemsHandler(req, res, onOrderConfig);
});

app.get("/available-now", async (req, res) => {
  await itemsHandler(req, res, availableConfig);
});

app.get("/all-best-sellers", async (req, res) => {
  const items = filterItemsByType("available now");
  logger.info(`found ${items.length} best seller items.`);
  res.send(items);
});

app.get("/all-on-order", async (req, res) => {
  const items = filterItemsByType("on order");
  logger.info(`found ${items.length} on order items.`);
  res.send(items);
});

app.get("/wish-list", async (req, res) => {
  logger.info(`sending wish list.`);
  res.send(db.data.wishListItems);
});

app.post("/wish-list", async (req, res) => {
  logger.info(`adding wish list item...`);
  logger.debug(req.body);
  db.data.wishListItems.push(req.body.title);
  await db.write();
  logger.info(`added ${req.body.title} to wish list.`);
  res.send(db.data.wishListItems);
});

app.delete("/wish-list", async (req, res) => {
  logger.info(`removing wish list item...`);
  logger.debug(req.body);
  const index = db.data.wishListItems.findIndex(
    (item) => item.toLowerCase() === req.body.title.toLowerCase()
  );
  if (index === -1) {
    res
      .status(404)
      .send(
        `${
          req.body.title
        } not found in wish list. Wish list items are: ${db.data.wishListItems.join(
          ", "
        )}.`
      );
  } else {
    db.data.wishListItems.splice(index, 1);
    await db.write();
    logger.info(`removed ${req.body.title} from wish list.`);
    res.send(db.data.wishListItems);
  }
});

app.get("*", (req, res) => {
  logger.info(`Endpoint not found.`);
  logger.debug(req);
  res.status(404).send(`Endpoint not found.`);
});

// Start server
app.listen(port, () => {
  logger.info(`server listening at http://localhost:${port}`);
});
