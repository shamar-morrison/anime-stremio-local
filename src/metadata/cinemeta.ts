import { config } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { fetchWithTimeout } from "../utils/timeout.js";

const log = createLogger("cinemeta");
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

export interface CinemetaVideo {
  season: number;
  episode: number;
  released?: string;
}

export interface CinemetaMeta {
  id: string;
  name: string;
  genres: string[];
  country?: string;
  year?: string;
  /** Regular episodes (season ≥ 1), sorted by season then episode. */
  videos: CinemetaVideo[];
}

interface RawMeta {
  id?: string;
  name?: string;
  genres?: string[];
  country?: string;
  year?: string | number;
  releaseInfo?: string;
  videos?: Array<{ season?: number; episode?: number; released?: string }>;
}

const cache = new Map<string, { value: CinemetaMeta | null; expiresAt: number }>();

/** Stremio's own metadata for an IMDb id (cached 1 h). Returns null when Cinemeta doesn't know it. */
export async function fetchCinemeta(type: "movie" | "series", imdbId: string): Promise<CinemetaMeta | null> {
  const key = `${type}:${imdbId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const res = await fetchWithTimeout(`${CINEMETA}/${type}/${encodeURIComponent(imdbId)}.json`, {}, config.kitsuTimeoutMs);
  const body = (await res.json()) as { meta?: RawMeta | null };
  const raw = body.meta;

  let value: CinemetaMeta | null = null;
  if (raw?.name) {
    const seen = new Set<string>();
    const videos = (raw.videos ?? [])
      .filter((v): v is CinemetaVideo => typeof v.season === "number" && v.season > 0 && typeof v.episode === "number")
      .filter((v) => {
        const id = `${v.season}:${v.episode}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => a.season - b.season || a.episode - b.episode);
    value = {
      id: imdbId,
      name: raw.name,
      genres: raw.genres ?? [],
      country: raw.country,
      year: raw.year !== undefined ? String(raw.year) : raw.releaseInfo,
      videos,
    };
  }
  cache.set(key, { value, expiresAt: Date.now() + config.kitsuCacheTtlMs });
  log.debug("fetched", { imdbId, name: value?.name, episodes: value?.videos.length });
  return value;
}

/** Japanese animation, i.e. worth looking up as anime. */
export function looksLikeAnime(meta: CinemetaMeta): boolean {
  return meta.genres.some((g) => /^animation$/i.test(g)) && /japan/i.test(meta.country ?? "");
}

/** 1-based position of S/E among all regular episodes, or null when Cinemeta doesn't list it. */
export function absoluteEpisode(meta: CinemetaMeta, season: number, episode: number): number | null {
  const index = meta.videos.findIndex((v) => v.season === season && v.episode === episode);
  return index === -1 ? null : index + 1;
}
