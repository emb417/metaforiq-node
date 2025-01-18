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
    `${
      db.data.libraryItems.filter((item) => item.type === "available now")
      .length
    } db best seller items found.`
  );
  res.send(
    db.data.libraryItems.filter((item) => item.type === "available now")
  );
}

export async function getOnOrder(req, res) {
  const db = await JSONFilePreset("./db.json", {});
  await db.read();
  logger.info(
    `${
      db.data.libraryItems.filter((item) => item.type === "on order").length
    } db on order items found.`
  );
  res.send(db.data.libraryItems.filter((item) => item.type === "on order"));
}