import { config } from "../config.js";
import type { KitsuAnime } from "../types.js";
import { createLogger } from "../utils/logger.js";
import { fetchWithTimeout } from "../utils/timeout.js";

const log = createLogger("kitsu");
const KITSU_API = "https://kitsu.io/api/edge";

export type ParsedId =
  | { kind: "kitsu"; kitsuId: string; season?: number; episode?: number }
  | { kind: "imdb"; imdbId: string; season?: number; episode?: number }
  | { kind: "unsupported"; reason: string };

/**
 * Parse a Stremio content id.
 *
 * Supported:
 *   kitsu:<id>                    (movie / whole entry)
 *   kitsu:<id>:<episode>          (format used by the Anime Kitsu catalog addon)
 *   kitsu:<id>:<season>:<episode>
 *   tt<digits>                    (Cinemeta movie)
 *   tt<digits>:<season>:<episode> (Cinemeta series episode)
 */
export function parseStremioId(id: string): ParsedId {
  const parts = id.split(":");
  const toInt = (value: string | undefined): number | undefined | null => {
    if (value === undefined) return undefined;
    return /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;
  };

  if (/^tt\d+$/.test(parts[0] ?? "")) {
    const [imdbId, s, e] = parts as [string, string?, string?];
    const season = toInt(s);
    const episode = toInt(e);
    if (season === null || episode === null || parts.length > 3 || (season !== undefined) !== (episode !== undefined)) {
      return { kind: "unsupported", reason: "malformed imdb id" };
    }
    return season === undefined ? { kind: "imdb", imdbId } : { kind: "imdb", imdbId, season, episode };
  }

  if (parts[0] !== "kitsu") return { kind: "unsupported", reason: `unknown id prefix "${parts[0]}"` };

  const [, kitsuId, a, b] = parts;
  if (!kitsuId || !/^\d+$/.test(kitsuId)) return { kind: "unsupported", reason: "malformed kitsu id" };

  const first = toInt(a);
  const second = toInt(b);
  if (first === null || second === null || parts.length > 4) {
    return { kind: "unsupported", reason: "malformed kitsu id" };
  }

  if (second !== undefined) return { kind: "kitsu", kitsuId, season: first, episode: second };
  if (first !== undefined) return { kind: "kitsu", kitsuId, episode: first };
  return { kind: "kitsu", kitsuId };
}

/** TV series and web series; excludes movies, OVAs, specials and recaps. */
export const isSeriesEntry = (anime: KitsuAnime): boolean => anime.subtype === "TV" || anime.subtype === "ONA";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** A tiny TTL cache that also coalesces concurrent lookups of the same key. Failures are not cached. */
function createCache<T>() {
  const values = new Map<string, CacheEntry<T>>();
  const inFlight = new Map<string, Promise<T>>();
  const set = (key: string, value: T): void => {
    values.set(key, { value, expiresAt: Date.now() + config.kitsuCacheTtlMs });
  };
  const get = (key: string, load: () => Promise<T>): Promise<T> => {
    const cached = values.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const promise = load()
      .then((value) => {
        set(key, value);
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  };
  return { set, get };
}

const animeCache = createCache<KitsuAnime>();
const prequelCache = createCache<KitsuAnime[]>();
const searchCache = createCache<KitsuAnime[]>();

interface KitsuResource {
  id: string;
  type?: string;
  attributes?: {
    canonicalTitle?: string;
    titles?: Record<string, string | null | undefined>;
    abbreviatedTitles?: string[] | null;
    subtype?: string;
    episodeCount?: number | null;
    startDate?: string | null;
  };
}

function toKitsuAnime(resource: KitsuResource): KitsuAnime | null {
  const attrs = resource.attributes;
  if (!attrs?.canonicalTitle) return null;
  return {
    id: resource.id,
    canonicalTitle: attrs.canonicalTitle,
    titles: {
      en: attrs.titles?.en ?? undefined,
      en_jp: attrs.titles?.en_jp ?? undefined,
      ja_jp: attrs.titles?.ja_jp ?? undefined,
    },
    abbreviatedTitles: attrs.abbreviatedTitles ?? [],
    subtype: attrs.subtype,
    episodeCount: attrs.episodeCount,
    startDate: attrs.startDate,
  };
}

async function kitsuGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${KITSU_API}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  const res = await fetchWithTimeout(
    url.toString(),
    { headers: { Accept: "application/vnd.api+json" } },
    config.kitsuTimeoutMs,
  );
  return (await res.json()) as T;
}

/** Fetch anime metadata from Kitsu, cached in memory for one hour. */
export function fetchKitsuAnime(kitsuId: string): Promise<KitsuAnime> {
  return animeCache.get(kitsuId, async () => {
    const body = await kitsuGet<{ data?: KitsuResource }>(`/anime/${encodeURIComponent(kitsuId)}`);
    const anime = body.data ? toKitsuAnime(body.data) : null;
    if (!anime) throw new Error(`Kitsu returned no title for anime ${kitsuId}`);
    log.info("resolved", { kitsuId, title: anime.canonicalTitle, subtype: anime.subtype });
    return anime;
  });
}

/** Direct prequels of an entry (usually one). */
export function fetchPrequels(kitsuId: string): Promise<KitsuAnime[]> {
  return prequelCache.get(kitsuId, async () => {
    const body = await kitsuGet<{ included?: KitsuResource[] }>(
      `/anime/${encodeURIComponent(kitsuId)}/media-relationships`,
      { "filter[role]": "prequel", include: "destination" },
    );
    const prequels = (body.included ?? [])
      .filter((r) => r.type === "anime")
      .map(toKitsuAnime)
      .filter((a): a is KitsuAnime => a !== null);
    for (const anime of prequels) animeCache.set(anime.id, anime);
    return prequels;
  });
}

/** Kitsu full-text search (used to find entries for IMDb titles missing from the mapping list). */
export function searchKitsuAnime(text: string): Promise<KitsuAnime[]> {
  return searchCache.get(text.toLowerCase(), async () => {
    const body = await kitsuGet<{ data?: KitsuResource[] }>("/anime", {
      "filter[text]": text,
      "page[limit]": "20",
    });
    const results = (body.data ?? []).map(toKitsuAnime).filter((a): a is KitsuAnime => a !== null);
    for (const anime of results) animeCache.set(anime.id, anime);
    return results;
  });
}
