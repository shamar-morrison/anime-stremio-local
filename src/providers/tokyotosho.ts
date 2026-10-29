import { XMLParser } from "fast-xml-parser";
import { titleWithEpisode } from "../metadata/searchTerms.js";
import type { Provider, RawTorrent } from "../types.js";
import { fetchWithTimeout } from "../utils/timeout.js";

const RSS_URL = "https://www.tokyotosho.info/rss.php";

const parser = new XMLParser({
  ignoreAttributes: true,
  // Keep titles like "86" as strings instead of numbers.
  parseTagValue: false,
  trimValues: true,
  htmlEntities: true,
});

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  category?: string;
  pubDate?: string;
}

interface RssDocument {
  rss?: { channel?: { item?: RssItem | RssItem[] } };
}

const MAGNET_RE = /magnet:\?xt=urn:btih:[^"'<>\s]+/i;
const SIZE_RE = /Size:\s*([\d.]+\s*[KMGT]i?B)/i;

/** Tokyo Toshokan's terms search is word-based; apostrophes split words badly. */
const buildQuery: Provider["buildQuery"] = (title, ctx, episode) =>
  titleWithEpisode(title.replace(/'/g, " ").replace(/\s+/g, " "), ctx, episode);

/** Parse Tokyo Toshokan RSS XML into raw torrents. Exported for tests. */
export function parseTokyoToshoRss(xml: string): RawTorrent[] {
  const doc = parser.parse(xml) as RssDocument;
  const items = doc.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];

  return list.flatMap((item): RawTorrent[] => {
    const description = String(item.description ?? "");
    // The magnet lives inside the description HTML; &amp; may or may not be decoded.
    const magnet = MAGNET_RE.exec(description)?.[0]?.replace(/&amp;/g, "&");
    if (!item.title || !magnet) return [];
    return [
      {
        source: "tokyotosho",
        title: String(item.title),
        magnet,
        size: SIZE_RE.exec(description)?.[1],
        category: item.category ? String(item.category) : undefined,
        date: item.pubDate ? new Date(item.pubDate) : undefined,
      },
    ];
  });
}

/** Tokyo Toshokan public RSS search. No seeder counts are available. */
export const tokyoTosho: Provider = {
  name: "tokyotosho",

  buildQuery,

  async search(term) {
    const url = new URL(RSS_URL);
    url.searchParams.set("terms", term);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
    });
    return parseTokyoToshoRss(await res.text());
  },
};
