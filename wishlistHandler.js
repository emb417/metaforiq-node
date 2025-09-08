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

export async function getWishListItems(req, res) {
  logger.info(`sending wish list.`);
  const db = await JSONFilePreset("/app/db.json", {});
  await db.read();
  res.send(db.data.wishListItems);
}

export async function addWishListItem(req, res) {
  logger.info(`adding wish list item...`);
  logger.debug(req.body);
  const db = await JSONFilePreset("/app/db.json", {});
  await db.read();
  db.data.wishListItems.push(req.body.title);
  await db.write();
  logger.info(`added ${req.body.title} to wish list.`);
  await db.read();
  res.send(db.data.wishListItems);
}

export async function removeWishListItem(req, res) {
  logger.info(`removing wish list item...`);
  logger.debug(req.body);
  const db = await JSONFilePreset("/app/db.json", {});
  await db.read();
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
    await db.read();
    res.send(db.data.wishListItems);
  }
}
