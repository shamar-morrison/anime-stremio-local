import { Nyaa } from "nyaa-sia";
import { titleWithEpisode } from "../metadata/searchTerms.js";
import type { Provider, RawTorrent } from "../types.js";

/**
 * RSS mode, not HTML: nyaa-sia 3.0.0's HTML parser only reads `tr.default`
 * rows, so it silently drops every trusted (green, e.g. SubsPlease/Erai-raws)
 * and remake row. The RSS feed returns every row with seeders, category and
 * info hash.
 */
const client = new Nyaa({ baseUrl: "https://nyaa.si", mode: "rss" });

/**
 * Nyaa.si via nyaa-sia. Only Nyaa reports live seeder/leecher counts.
 * nyaa-sia's fetch takes no AbortSignal, so the provider runner enforces the
 * timeout. It also interpolates the query into the URL as-is, so it must be
 * encoded here.
 */
export const nyaa: Provider = {
  name: "nyaa",

  buildQuery: titleWithEpisode,

  async search(term) {
    const result = await client.search(encodeURIComponent(term), {
      category: "anime",
      sort: "seeders",
      order: "desc",
      page: 1,
    });

    return result.data.map(
      (t): RawTorrent => ({
        source: "nyaa",
        title: t.name,
        magnet: t.magnet,
        infoHash: t.hash,
        size: t.size,
        seeders: t.seeders,
        leechers: t.leechers,
        category: t.category,
        date: t.date,
      }),
    );
  },
};
