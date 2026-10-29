import { titleWithEpisode } from "../metadata/searchTerms.js";
import type { Provider, RawTorrent } from "../types.js";
import { fetchWithTimeout } from "../utils/timeout.js";

const BASE_URL = "https://api.animes.garden";
const PAGE_SIZE = 75;

interface AnimeGardenResource {
  id: number;
  provider: string;
  providerId?: string;
  title: string;
  href?: string;
  type?: string;
  magnet?: string;
  /** Bytes. */
  size?: number;
  createdAt?: string;
}

interface AnimeGardenResponse {
  status?: string;
  resources?: AnimeGardenResource[];
}

/**
 * Anime Garden aggregates dmhy, bangumi.moe, mikan and ANi. It exposes no
 * seeder counts, and its magnets usually carry base32 info hashes.
 */
export const animeGarden: Provider = {
  name: "animegarden",

  buildQuery: titleWithEpisode,

  async search(term) {
    const url = new URL("/resources", BASE_URL);
    url.searchParams.set("search", term);
    url.searchParams.set("type", "动画");
    url.searchParams.set("pageSize", String(PAGE_SIZE));

    const res = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
    const body = (await res.json()) as AnimeGardenResponse;
    if (body.status && body.status !== "OK") throw new Error(`Anime Garden status ${body.status}`);

    return (body.resources ?? []).map(
      (r): RawTorrent => ({
        source: "animegarden",
        title: r.title,
        magnet: r.magnet,
        size: typeof r.size === "number" ? r.size : undefined,
        category: r.provider,
        date: r.createdAt ? new Date(r.createdAt) : undefined,
      }),
    );
  },
};
