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
1. [lowdb](https://github.com/typicode/lowdb) - database
1. [pino](https://github.com/pinojs/pino) - logger
1. [node-fetch](https://github.com/node-fetch/node-fetch/tree/2.x#readme) - request lib
1. [cheerio](https://github.com/cheeriojs/cheerio) - html parser
1. [node-cron](https://github.com/node-cron/node-cron) - cron scheduler

## Primary Capabilities

### Find On-Order Blurays in past 7 days

1. Scape items from [newly acquired page](https://wccls.bibliocommons.com/v2/search?query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS)

### Check for Now Available New Release Blurays

1. Scrape ids from [now available page](https://wccls.bibliocommons.com/v2/search?custom_edit=false&query=anywhere%3A(%5B0%20TO%20180%5D)%20%20%20avlocation%3A%22Beaverton%20Murray%20Scholls%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&f_STATUS=39&f_NEWLY_ACQUIRED=PAST_180_DAYS)

### Wish List

1. manage wish list of keywords through these endpoints
    * `/wish-list`
    * `/add-to-wish-list/:keywords`
    * `/remove-from-wish-list/:keywords`
1. responses from scraping will be filtered by the wish list keyword(s) in the item titles

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
