import "dotenv/config";
import fetch from "node-fetch";
import { load as cheerioLoad } from "cheerio";
import { JSONFilePreset } from "lowdb/node";
import pino from "pino";
import { locations, availabilityUrl } from "./configs.js";
import sendDiscordNotification from "./discordHandler.js";

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

async function getLibraryData(config) {
  const response = await fetch(config.fetchUrl);
  const data = await response.text();
  const $ = cheerioLoad(data);
  const script = $(config.scriptValue).text();
  let libraryData;
  try {
    libraryData = JSON.parse(script);
  } catch (error) {
    logger.error(`failed to parse script data: ${error.message}`);
    return [];
  }
  return libraryData;
}

function refreshTitles(libraryData, config) {
  const refreshedTitles = [];
  for (const itemId in libraryData.entities.bibs) {
    const item = libraryData.entities.bibs[itemId];
    refreshedTitles.push({
      id: item.id,
      type: config.type,
      title: item.briefInfo.title,
      subtitle: item.briefInfo.subtitle,
      publicationYear: item.briefInfo.publicationDate,
      format: item.briefInfo.format,
      edition: item.briefInfo.edition,
      description: item.briefInfo.description,
      image: item.briefInfo.jacket.large,
      url: `https://wccls.bibliocommons.com/v2/record/${item.id}`,
      updateDate: Math.floor(Date.now() / 1000),
    });
  }
  logger.debug(`${refreshedTitles.length} titles refreshed.`);

  return refreshedTitles;
}

async function getAvailableBibItems(availableTitles) {
  logger.info(
    `${availableTitles.length} available titles >> getting detailed availability data...`
  );
  const availableBibItems = [];
  let counter = 1;
  for (const item of availableTitles) {
    try {
      const response = await fetch(availabilityUrl(item.id));
      const data = await response.text();
      const bibItemsData = JSON.parse(data).entities.bibItems;
      const availableBibItemsForTitle = Object.values(bibItemsData)
        .filter((bibItem) => bibItem.availability.status === "AVAILABLE")
        .map((bibItem) => ({ ...bibItem, id: item.id }));
      logger.debug(
        `${counter}. ${availableBibItemsForTitle.length} of ${
          Object.values(bibItemsData).length
        } bibItems found for ${item.title}.`
      );
      availableBibItems.push(...availableBibItemsForTitle);
      counter++;
    } catch (error) {
      logger.error(`failed to parse bibItems for ${item.id}: ${error.message}`);
    }
  }
  return availableBibItems;
}

export async function refreshItems(config) {
  try {
    logger.info(`refreshing ${config.type} titles...`);
    const libraryData = await getLibraryData(config);
    const db = await JSONFilePreset("/app/data/db.json", {});
    await db.read();
    const refreshedTitles = refreshTitles(libraryData, config);
    // Remove items that haven't been updated in the past 30 days
    db.data.libraryItems = db.data.libraryItems.filter(
      (item) =>
        item.updateDate > Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
    );
    // Segment other existing library items of the opposite type
    const otherExisitngLibraryItems = db.data.libraryItems.filter(
      (item) => item.type !== config.type
    );
    // Merge refreshedTitles with the filtered library items
    db.data.libraryItems = [
      ...otherExisitngLibraryItems,
      ...refreshedTitles.map((refreshedTitle) => {
        const libraryItem = db.data.libraryItems.find(
          (libraryItem) => libraryItem.id === refreshedTitle.id
        );
        if (libraryItem) {
          return { ...libraryItem, ...refreshedTitle };
        }

        refreshedTitle.createDate = Math.floor(Date.now() / 1000);
        return refreshedTitle;
      }),
    ];

    await db.write();

    let newlyAvailable = [],
      onOrderTitles = [],
      messageText = [];
    if (config.type === "available now") {
      const availableItems = db.data.libraryItems.filter(
        (item) => item.type === config.type
      );
      const availableBibItems = await getAvailableBibItems(availableItems);
      if (availableBibItems.length > 0) {
        availableBibItems.forEach((bibItem) => {
          const location = locations.find(
            (location) => location.name === bibItem.branch.name
          );
          if (!location) return;

          const dbItem = db.data.libraryItems.find(
            (item) => item.id === bibItem.id
          );

          if (!dbItem.availability) {
            dbItem.availability = {};
          }

          const availability = dbItem.availability[location.code] || {};
          const notifyDelayExceeded =
            !availability.notifyDate ||
            new Date(availability.notifyDate * 1000) <
              new Date(Date.now() - process.env.NOTIFY_DELAY);

          if (notifyDelayExceeded) {
            logger.trace(`${dbItem.title} now available at ${location.name}.`);
            availability.notifyDate = Math.floor(Date.now() / 1000);
            availability.location = location.name;
            newlyAvailable.push(dbItem);

            if (
              db.data.wishListItems.some((wishListItem) =>
                dbItem.title.toLowerCase().includes(wishListItem.toLowerCase())
              )
            ) {
              messageText.push(
                `${dbItem.title}\n${location.name}\n${dbItem.url}`
              );
            }
          }

          dbItem.availability[location.code] = availability;

          const index = db.data.libraryItems.findIndex(
            (item) => item.id === dbItem.id
          );

          if (index !== -1) {
            db.data.libraryItems[index] = dbItem;
          }
        });

        logger.debug(`${newlyAvailable.length} newly available items found.`);
        logger.debug(`${messageText.length} availablity notifications...`);
      }
    } else if (config.type === "on order") {
      onOrderTitles = db.data.libraryItems.filter(
        (item) => item.type === config.type
      );
      for (const item of onOrderTitles.filter((title) => !title.notifyDate)) {
        item.notifyDate = Math.floor(Date.now() / 1000);
        messageText.push(`${item.title}\n${item.url}`);
      }
      logger.debug(`sending ${messageText.length} notifications...`);

      onOrderTitles.forEach((title) => {
        const index = db.data.libraryItems.findIndex(
          (item) => item.id === title.id
        );

        if (index !== -1) {
          db.data.libraryItems[index] = title;
        }
      });
    }

    await db.write();

    if (messageText.length > 0) {
      const message = `${config.type} alert!!!\n${messageText.join("\n\n")}`;
      sendDiscordNotification(message);
    } else {
      logger.info(`no new titles ${config.type}.`);
    }

    return config.type === "on order" ? onOrderTitles : newlyAvailable;
  } catch (error) {
    logger.error(error);
  }
}

export async function getItems(req, res, config) {
  try {
    const items = await refreshItems(config);
    if (items.length === 0) {
      res.send(`No new titles ${config.type}.`);
    } else {
      res.send(items);
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
}
