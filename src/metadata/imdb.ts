import type { KitsuAnime } from "../types.js";
import { createLogger } from "../utils/logger.js";
import { lookupImdb, type MappedEntry } from "./animeLists.js";
import { absoluteEpisode, fetchCinemeta, looksLikeAnime, type CinemetaMeta } from "./cinemeta.js";
import { fetchKitsuAnime, isSeriesEntry, searchKitsuAnime } from "./kitsu.js";
import { titleTokens } from "./searchTerms.js";

const log = createLogger("imdb");

export interface ResolvedTarget {
  kitsuId: string;
  /** Episode number within that Kitsu entry (series only). */
  episode?: number;
  /** How it was resolved, for logs. */
  via: string;
}

/** Allow a Kitsu entry to start a little before Cinemeta's first episode (premieres, time zones). */
const START_DATE_SLACK_MS = 60 * 24 * 60 * 60 * 1000;

const byStartDate = (a: KitsuAnime, b: KitsuAnime): number =>
  (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999");

/** True when one of the entry's titles begins with the Cinemeta name. */
function nameMatches(anime: KitsuAnime, name: string): boolean {
  const wanted = titleTokens(name);
  if (wanted.length === 0) return false;
  const titles = [anime.canonicalTitle, anime.titles.en, anime.titles.en_jp, ...anime.abbreviatedTitles];
  return titles.some((title) => {
    if (!title) return false;
    const tokens = titleTokens(title);
    return wanted.every((token, i) => tokens[i] === token);
  });
}

async function loadEntries(entries: MappedEntry[]): Promise<KitsuAnime[]> {
  const ids = [...new Set(entries.map((e) => e.kitsuId))];
  const settled = await Promise.allSettled(ids.map((id) => fetchKitsuAnime(id)));
  return settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
}

/** Kitsu entries for an anime that is missing from the mapping list, found by its Cinemeta name. */
async function searchByName(meta: CinemetaMeta, subtype: "series" | "movie"): Promise<KitsuAnime[]> {
  const results = await searchKitsuAnime(meta.name);
  const firstAired = meta.videos[0]?.released ? Date.parse(meta.videos[0].released) : Number.NaN;
  return results.filter((anime) => {
    if (subtype === "movie" ? anime.subtype !== "movie" : !isSeriesEntry(anime)) return false;
    if (!nameMatches(anime, meta.name)) return false;
    if (subtype === "series" && Number.isFinite(firstAired) && anime.startDate) {
      // Drops the original 2004 BLEACH when the title is "Bleach: Thousand-Year Blood War" (2022).
      if (Date.parse(anime.startDate) < firstAired - START_DATE_SLACK_MS) return false;
    }
    if (subtype === "movie" && meta.year && anime.startDate) {
      if (Math.abs(Number.parseInt(meta.year, 10) - Number.parseInt(anime.startDate, 10)) > 1) return false;
    }
    return true;
  });
}

/**
 * Map an absolute (franchise-wide) episode number onto Kitsu's per-cour entries,
 * e.g. Cinemeta "Bleach: Thousand-Year Blood War" S4E1 = episode 41 overall →
 * entries of 13, 13, 14, 10 episodes → 4th entry, episode 1.
 */
export function locateEpisode(entries: KitsuAnime[], absolute: number): { anime: KitsuAnime; episode: number } | null {
  let remaining = absolute;
  for (const [i, anime] of entries.entries()) {
    const count = anime.episodeCount;
    // The last entry, or one still airing (no count yet), takes whatever is left.
    if (i === entries.length - 1 || !count || remaining <= count) return { anime, episode: remaining };
    remaining -= count;
  }
  return null;
}

async function resolveMovie(imdbId: string, mapped: MappedEntry[]): Promise<ResolvedTarget | null> {
  const movie = mapped.find((e) => e.type === "MOVIE") ?? (mapped.length === 1 ? mapped[0] : undefined);
  if (movie) return { kitsuId: movie.kitsuId, via: "anime-lists" };

  const meta = await fetchCinemeta("movie", imdbId);
  if (!meta || !looksLikeAnime(meta)) return null;
  const [found] = await searchByName(meta, "movie");
  return found ? { kitsuId: found.id, via: "name-search" } : null;
}

async function resolveSeries(
  imdbId: string,
  mapped: MappedEntry[],
  season: number,
  episode: number,
): Promise<ResolvedTarget | null> {
  const seriesMapped = mapped.filter((e) => !e.type || e.type === "TV" || e.type === "ONA");

  // 1. Exactly one Kitsu entry for this season: numbering lines up as-is.
  const sameSeason = seriesMapped.filter((e) => e.tvdbSeason === season);
  if (sameSeason.length === 1) return { kitsuId: sameSeason[0]!.kitsuId, episode, via: "anime-lists season" };

  // 2. Otherwise walk the entries in airing order using the absolute episode number.
  const meta = await fetchCinemeta("series", imdbId);
  let candidates: KitsuAnime[];
  let via: string;
  if (seriesMapped.length > 0) {
    candidates = await loadEntries(seriesMapped);
    via = "anime-lists order";
  } else {
    if (!meta || !looksLikeAnime(meta)) return null;
    candidates = await searchByName(meta, "series");
    via = "name-search order";
  }

  const entries = candidates.filter(isSeriesEntry).sort(byStartDate);
  if (entries.length === 0) return null;

  const absolute = meta ? absoluteEpisode(meta, season, episode) : null;
  if (absolute === null) {
    return entries.length === 1 ? { kitsuId: entries[0]!.id, episode, via } : null;
  }
  const located = locateEpisode(entries, absolute);
  return located ? { kitsuId: located.anime.id, episode: located.episode, via } : null;
}

/**
 * Resolve a Cinemeta (IMDb) request to a Kitsu entry + episode. Returns null
 * for titles that are not anime (Stremio asks about every tt… title once
 * `tt` is in idPrefixes), which keeps those requests cheap: a map lookup and
 * at most one cached Cinemeta call.
 */
export async function resolveImdb(
  type: string,
  imdbId: string,
  season: number | undefined,
  episode: number | undefined,
): Promise<ResolvedTarget | null> {
  const mapped = await lookupImdb(imdbId);
  let target: ResolvedTarget | null = null;
  if (type === "movie") target = await resolveMovie(imdbId, mapped);
  else if (season !== undefined && episode !== undefined) {
    target = await resolveSeries(imdbId, mapped, season, episode);
  }

  if (target) {
    log.info("mapped", {
      imdbId,
      season,
      episode,
      kitsuId: target.kitsuId,
      kitsuEpisode: target.episode,
      via: target.via,
    });
  }
  else log.debug("not an anime we can map", { imdbId, mappedEntries: mapped.length });
  return target;
}
