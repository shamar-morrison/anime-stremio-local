import { AddonBuilder, type Stream } from "@stremio-addon/sdk";
import { manifest } from "./manifest.js";
import { fetchContinuation } from "./metadata/episodeOffset.js";
import { resolveImdb } from "./metadata/imdb.js";
import { fetchKitsuAnime, parseStremioId } from "./metadata/kitsu.js";
import { buildSearchContext } from "./metadata/searchTerms.js";
import { dedupeByInfoHash } from "./processing/dedupe.js";
import { matchesRequest, parseEpisodeInfo } from "./processing/episode.js";
import { isEnglishRelease } from "./processing/language.js";
import { normalizeTorrent } from "./processing/normalize.js";
import { isRelevantRelease } from "./processing/relevance.js";
import { sortTorrents } from "./processing/sort.js";
import { toStremioStream } from "./processing/stream.js";
import { searchAllProviders } from "./providers/index.js";
import type { KitsuAnime, NormalizedTorrent, SearchContext } from "./types.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("addon");

/** Stremio may cache non-empty answers for 10 minutes; empty ones only for 1 minute. */
const CACHE_HIT_SECONDS = 600;
const CACHE_EMPTY_SECONDS = 60;

const empty = () => ({ streams: [] as Stream[], cacheMaxAge: CACHE_EMPTY_SECONDS });

/**
 * Right show and right episode. A release named after the franchise rather
 * than this cour ("BLEACH Thousand Year Blood War S01E41") only counts when it
 * carries the absolute episode number.
 */
export function isWanted(torrent: NormalizedTorrent, ctx: SearchContext): boolean {
  const info = parseEpisodeInfo(torrent.title);
  if (torrent.batch && ctx.type === "series") info.isBatch = true;
  if (!matchesRequest(info, ctx)) return false;
  if (isRelevantRelease(torrent.title, ctx.titles)) return true;
  return (
    ctx.franchiseTitles !== undefined &&
    ctx.absoluteEpisode !== undefined &&
    info.episode === ctx.absoluteEpisode &&
    isRelevantRelease(torrent.title, ctx.franchiseTitles)
  );
}

/** Turn a Stremio id into a Kitsu entry + per-entry episode number. */
async function resolveTarget(type: string, id: string): Promise<{ kitsuId: string; episode?: number } | null> {
  const parsed = parseStremioId(id);
  if (parsed.kind === "unsupported") {
    log.warn("unsupported id", { id, reason: parsed.reason });
    return null;
  }
  if (parsed.kind === "imdb") {
    // Stremio asks about every Cinemeta title; non-anime ones resolve to null quietly.
    return resolveImdb(type, parsed.imdbId, parsed.season, parsed.episode);
  }
  return { kitsuId: parsed.kitsuId, episode: parsed.episode };
}

/** Resolve a Stremio stream request to a sorted list of torrent streams. */
export async function getStreams(type: string, id: string): Promise<Stream[]> {
  const target = await resolveTarget(type, id);
  if (!target) return [];
  if (type === "series" && target.episode === undefined) {
    log.warn("series request without an episode number", { id });
    return [];
  }

  let anime: KitsuAnime;
  try {
    anime = await fetchKitsuAnime(target.kitsuId);
  } catch (err) {
    log.error("kitsu lookup failed", { id, kitsuId: target.kitsuId, err });
    return [];
  }

  // Releases of later cours often keep counting from the first one.
  const continuation = type === "series" ? await fetchContinuation(anime) : undefined;
  const ctx = buildSearchContext(anime, type, target.episode, continuation);
  log.info("searching", {
    id,
    kitsuId: anime.id,
    type: ctx.type,
    titles: ctx.titles.join(" | "),
    season: ctx.expectedSeason,
    episode: ctx.episode,
    absoluteEpisode: ctx.absoluteEpisode,
    franchise: ctx.franchiseTitles?.join(" | "),
  });

  const { torrents: raw } = await searchAllProviders(ctx);

  const english = raw.filter(isEnglishRelease);
  const normalized = english
    .map(normalizeTorrent)
    .filter((t): t is NormalizedTorrent => t !== null);
  const matching = normalized.filter((t) => isWanted(t, ctx));
  const unique = dedupeByInfoHash(matching);
  const sorted = sortTorrents(unique);

  log.info("done", {
    id,
    raw: raw.length,
    english: english.length,
    withHash: normalized.length,
    matching: matching.length,
    unique: unique.length,
    dubbed: sorted.filter((t) => t.isDub).length,
  });

  return sorted.map(toStremioStream);
}

const builder = new AddonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  try {
    const streams = await getStreams(type, id);
    return streams.length > 0 ? { streams, cacheMaxAge: CACHE_HIT_SECONDS } : empty();
  } catch (err) {
    // Never let one bad request take the addon down; Stremio shows "no streams".
    log.error("stream handler failed", { type, id, err });
    return empty();
  }
});

export const addonInterface = builder.getInterface();
