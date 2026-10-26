/**
 * Known crawlers, link-preview fetchers, headless browsers and scripted clients (OD-11). Their scans and
 * menu metrics are accepted but not counted, so a shared link previewed in a chat is not a "scan".
 * A heuristic on the User-Agent only: it is not a security control and it stores nothing.
 */
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|archiver|facebookexternalhit|facebookcatalog|embedly|quora link preview|pinterest|vkshare|w3c_validator|whatsapp|skypeuripreview|bingpreview|google-inspectiontool|headlesschrome|phantomjs|lighthouse|chrome-lighthouse|pagespeed|preview|python-requests|python-urllib|aiohttp|curl\/|wget\/|httpclient|go-http-client|okhttp|java\/|libwww|axios\//i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOT_UA.test(userAgent);
}
