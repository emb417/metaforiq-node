import "dotenv/config";
import express from "express";
import pino from "pino";
import cron from "node-cron";
import auth from "./authHandler.js";
import { availableConfig, onOrderConfig } from "./configs.js";
import getPinballData from "./pinballHandler.js";
import {
  getItems,
  getBestSellers,
  getOnOrder,
  getWishListItems,
  addWishListItem,
  removeWishListItem,
  scrapeItems,
} from "./wcclsHandler.js";

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

// Middleware
app.use(express.json()); // for parsing application/json

// Routes
app.post("/auth", async (req, res) => {
  await auth(req, res);
});

app.get("/on-order", async (req, res) => {
  await getItems(req, res, onOrderConfig);
});

app.get("/pinball", async (req, res) => {
  await getPinballData(req, res);
});

app.get("/available-now", async (req, res) => {
  await getItems(req, res, availableConfig);
});

app.get("/all-best-sellers", async (req, res) => {
  await getBestSellers(req, res);
});

app.get("/all-on-order", async (req, res) => {
  await getOnOrder(req, res);
});

app.get("/wish-list", async (req, res) => {
  await getWishListItems(req, res);
});

app.post("/wish-list", async (req, res) => {
  await addWishListItem(req, res);
});

app.delete("/wish-list", async (req, res) => {
  await removeWishListItem(req, res);
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
