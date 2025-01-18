import "dotenv/config";
import { JSONFilePreset } from "lowdb/node";
import pino from "pino";

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

export async function getBestSellers(req, res) {
  const db = await JSONFilePreset("./db.json", {});
  await db.read();
  logger.info(
    `found ${
      db.data.libraryItems.filter((item) => item.type === "available now")
      .length
    } best seller items.`
  );
  res.send(
    db.data.libraryItems.filter((item) => item.type === "available now")
  );
}

export async function getOnOrder(req, res) {
  const db = await JSONFilePreset("./db.json", {});
  await db.read();
  logger.info(
    `found ${
      db.data.libraryItems.filter((item) => item.type === "on order").length
    } on order items.`
  );
  res.send(db.data.libraryItems.filter((item) => item.type === "on order"));
}