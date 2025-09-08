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

export default async function auth(req, res) {
  logger.info(`authenticating...`);

  const db = await JSONFilePreset("/app/db.json", {});
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
