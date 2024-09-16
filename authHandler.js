import "dotenv/config";
import fs from "fs";
import path from "path";
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

// Set up database
const __dirname = path.resolve();
const dbPath = path.join(__dirname, "db.json");

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '{ "libraryItems": [], "wishListItems": [] }');
}

export default async function auth(req, res) {
  logger.info(`authenticating...`);

  const db = await JSONFilePreset("db.json", {});
  await db.read();

  let userId = null;
  if (req.body && Object.keys(req.body).length > 0) {
    const user = db.data.users.find(
      (user) =>
        user.username === req.body.username &&
        user.password === req.body.password
    );
    userId = user ? user.id : null;
  }
  if (userId !== null) {
    logger.info(`authenticated!`);
    logger.debug(`user id: ${userId}`);
    res.send({ userId: userId });
  } else {
    logger.info(`unauthenticated.`);
    res.status(401).send({});
  }
}
