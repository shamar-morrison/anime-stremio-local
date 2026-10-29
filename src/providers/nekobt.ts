import { titleWithEpisode } from "../metadata/searchTerms.js";
import type { Provider, RawTorrent } from "../types.js";
import { fetchWithTimeout } from "../utils/timeout.js";

/**
 * nekoBT's search endpoint, the same one its website uses. It is undocumented,
 * so every field is treated as optional. robots.txt allows search use
 * (`Content-Signal: search=yes`).
 */
const SEARCH_URL = "https://nekobt.to/api/v1/torrents/search";
const LIMIT = 100;

interface NekoTorrent {
  title?: string;
  infohash?: string;
  magnet?: string;
  /** Bytes, as a string. */
  filesize?: string | number;
  seeders?: string | number;
  leechers?: string | number;
  /** Fansub subtitle languages, e.g. "en,enm". */
  fsub_lang?: string | null;
  /** Official (streaming-service) subtitle languages, e.g. "en,de,es-419". */
  sub_lang?: string | null;
  /** Audio languages, e.g. "ja,en" for dual audio. */
  audio_lang?: string | null;
  batch?: boolean;
  deleted?: unknown;
  hidden?: boolean;
  uploaded_at?: number;
}

interface NekoResponse {
  error?: boolean;
  message?: string;
  data?: { results?: NekoTorrent[] };
}

const langs = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);

const toNumber = (value: string | number | undefined): number | undefined => {
  const n = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
};

/** Convert a nekoBT API response into raw torrents. Exported for tests. */
export function parseNekoResults(body: NekoResponse): RawTorrent[] {
  if (body.error) throw new Error(`nekoBT error: ${body.message ?? "unknown"}`);
  return (body.data?.results ?? []).flatMap((t): RawTorrent[] => {
    if (!t.title || t.deleted || t.hidden) return [];
    return [
      {
        source: "nekobt",
        title: t.title,
        magnet: t.magnet,
        infoHash: t.infohash,
        size: toNumber(t.filesize),
        seeders: toNumber(t.seeders),
        leechers: toNumber(t.leechers),
        subtitleLangs: [...new Set([...langs(t.fsub_lang), ...langs(t.sub_lang)])],
        audioLangs: langs(t.audio_lang),
        batch: t.batch === true,
        date: typeof t.uploaded_at === "number" ? new Date(t.uploaded_at) : undefined,
      },
    ];
  });
}

/**
 * nekoBT: a newer anime tracker. Reports seeders and structured subtitle /
 * audio languages, and carries releases that Nyaa's search misses.
 */
export const nekoBt: Provider = {
  name: "nekobt",

  buildQuery: titleWithEpisode,

  async search(term) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", term);
    url.searchParams.set("limit", String(LIMIT));
    const res = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } });
    return parseNekoResults((await res.json()) as NekoResponse);
  },
};
