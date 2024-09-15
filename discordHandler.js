import "dotenv/config";
import pino from "pino";
import discord from "discord.js";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

export default function sendDiscordNotification(content) {
  const webhookClient = new discord.WebhookClient({
    url: process.env.DISCORD_WEBHOOK_URL,
  });
  webhookClient
    .send({ content: content })
    .then(() => logger.info("Discord notification sent!"))
    .catch((error) =>
      logger.error("Failed to send Discord notification:", error)
    );
}
