export const locations = [
  { code: 9, name: "Beaverton City Library" },
  { code: 29, name: "Tigard Public Library" },
  { code: 31, name: "Tualatin Public Library" },
  { code: 39, name: "Beaverton Murray Scholls" },
];

export const availableConfig = {
  type: "available now",
  fetchUrl:
    "https://wccls.bibliocommons.com/v2/search?custom_edit=false&query=collection%3A%22Best%20Sellers%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&locked=true&f_STATUS=9%7C39%7C29%7C31&f_NEWLY_ACQUIRED=PAST_180_DAYS",
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]',
};

export const availabilityUrl = (itemId) => {
  return `https://gateway.bibliocommons.com/v2/libraries/wccls/bibs/${itemId}/availability?locale=en-US`;
};

export const onOrderConfig = {
  type: "on order",
  fetchUrl:
    "https://wccls.bibliocommons.com/v2/search?query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS",
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]',
};
