# wccls-bot

aka Libowski-bot, automating a couple frequent activities:

1. looking for items recently ordered by the library to be first to reserve for a shorter wait once the library gets the item
1. checking for items currently on the shelf that cannot be reserved

## Getting Started

1. Install

    ```bash
    npm install
    ```

1. Start

    ```bash
    npm start
    ```

1. Once started, cron jobs will run periodically, or you can test for a response:

    ```bash
    curl localhost:8008
    ```

## Tech Stack

1. nodejs - js runtime
1. express - http server
1. lowdb - database - https://github.com/typicode/lowdb
1. pino - logger - https://github.com/pinojs/pino
1. node-fetch - request lib - https://github.com/node-fetch/node-fetch/tree/2.x#readme
1. cheerio - html parser - https://github.com/cheeriojs/cheerio
1. node-cron - cron scheduler - https://github.com/node-cron/node-cron

## Primary Capabilities

### Find On-Order Blurays in past 7 days

1. Scape items from "https://wccls.bibliocommons.com/v2/search?query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS"

### Check for Now Available New Release Blurays

1. Scrape ids from "https://wccls.bibliocommons.com/v2/search?custom_edit=false&query=anywhere%3A(%5B0%20TO%20180%5D)%20%20%20avlocation%3A%22Beaverton%20Murray%20Scholls%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&f_STATUS=39&f_NEWLY_ACQUIRED=PAST_180_DAYS"

### Wish List

1. wish list of keywords hard-coded in server.js and written to the db
1. responses from scraping will be filtered by the wish list keyword is the item titles contain the keywords

### Scheduled Runs

1. using node-cron to periodically scrape library items

## To Do List

### CRUD Keywords for matching against wish list

1. notify on matches or reserve and notify
1. ui for managing keywords
1. ui for reviewing list and reserving

### Reserve On-Order

1. Login to account and get session cookie from response
1. Use session cookie to form url and POST to URL (TBD)
