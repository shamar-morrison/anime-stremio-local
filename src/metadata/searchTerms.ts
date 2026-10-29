import { config } from "../config.js";
import type { KitsuAnime, SearchContext } from "../types.js";

const ORDINAL_WORDS: Record<string, number> = {
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
};

export const ROMAN_NUMERALS: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6 };

/** Season markers that appear at the end of Kitsu titles, with their extractor. */
const SEASON_SUFFIXES: Array<{ pattern: RegExp; season: (m: RegExpExecArray) => number }> = [
  { pattern: /\s*(\d+)(?:st|nd|rd|th)\s+season\b.*$/i, season: (m) => Number(m[1]) },
  { pattern: /\s*\bseason\s*(\d+)\b.*$/i, season: (m) => Number(m[1]) },
  {
    pattern: /\s*\b(second|third|fourth|fifth|sixth)\s+season\b.*$/i,
    season: (m) => ORDINAL_WORDS[m[1]!.toLowerCase()] ?? 1,
  },
  { pattern: /\s+S(\d{1,2})$/i, season: (m) => Number(m[1]) },
  { pattern: /\s+(II|III|IV|V|VI)$/, season: (m) => ROMAN_NUMERALS[m[1]!] ?? 1 },
];

/** Only a trailing marker counts: "JoJo … Part 5: Ougon no Kaze" is a story arc, not a cour. */
const PART_SUFFIX = /\s+(?:Part|Cour)\s*(\d)$/i;

/** Remove punctuation that hurts full-text search and collapse whitespace. */
export function sanitizeTitle(title: string): string {
  return title
    .replace(/[’`]/g, "'")
    .replace(/\s*×\s*/g, " x ")
    .replace(/[:!?,.;/\\|"“”()[\]{}~]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a Kitsu title into its base name and the season / part it implies:
 * "Shingeki no Kyojin Season 3 Part 2" → { base: "Shingeki no Kyojin", season: 3, part: 2 }.
 * Fansubs write these markers inconsistently ("S2", "2nd Season", "Cour 2"),
 * so they are searched without them and filtered locally instead.
 */
export function splitSeason(title: string): { base: string; season: number; part: number } {
  let base = title;
  let part = 1;
  const partMatch = PART_SUFFIX.exec(base);
  if (partMatch && partMatch.index > 0) {
    part = Number(partMatch[1]);
    base = base.slice(0, partMatch.index).trim();
  }
  for (const { pattern, season } of SEASON_SUFFIXES) {
    const match = pattern.exec(base);
    if (match) {
      const stripped = base.slice(0, match.index).trim();
      const value = season(match);
      if (stripped.length > 0 && value > 0) return { base: stripped, season: value, part };
    }
  }
  return { base, season: 1, part };
}

export function isMovie(anime: KitsuAnime, requestType: string): boolean {
  return requestType === "movie" || anime.subtype?.toLowerCase() === "movie";
}

function titleCandidates(anime: KitsuAnime): string[] {
  return [anime.canonicalTitle, anime.titles.en_jp, anime.titles.en].filter(
    (t): t is string => typeof t === "string" && t.trim().length > 0,
  );
}

/** Distinct sanitized search titles of an entry (season/part markers removed). */
function searchTitles(anime: KitsuAnime): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const candidate of titleCandidates(anime)) {
    const clean = sanitizeTitle(splitSeason(candidate).base);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      titles.push(clean);
    }
  }
  return titles;
}

/** Season / part implied by an entry's titles. Any variant that names one decides it. */
export function inferSeasonPart(anime: KitsuAnime): { season: number; part: number } {
  let season = 1;
  let part = 1;
  for (const candidate of titleCandidates(anime)) {
    const split = splitSeason(candidate);
    season = Math.max(season, split.season);
    part = Math.max(part, split.part);
  }
  return { season, part };
}

/** Lowercase words of a title with season/part markers removed, for comparing franchise names. */
export function titleTokens(title: string): string[] {
  return sanitizeTitle(splitSeason(title).base)
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Build the search context (title variants, season, episode) for a request. */
export function buildSearchContext(
  anime: KitsuAnime,
  requestType: string,
  episode: number | undefined,
  continuation?: { offset: number; root?: KitsuAnime },
): SearchContext {
  const movie = isMovie(anime, requestType) || episode === undefined;
  const titles = searchTitles(anime).slice(0, config.maxTitleVariants);
  const offset = continuation?.offset ?? 0;
  const absolute = !movie && episode !== undefined && offset > 0;

  const own = new Set(titles.map((t) => t.toLowerCase()));
  const franchiseTitles =
    absolute && continuation?.root
      ? searchTitles(continuation.root)
          .filter((t) => !own.has(t.toLowerCase()))
          .slice(0, config.maxTitleVariants)
      : [];

  const { season, part } = inferSeasonPart(anime);
  return {
    kitsuId: anime.id,
    type: movie ? "movie" : "series",
    titles,
    episode: movie ? undefined : episode,
    absoluteEpisode: absolute ? episode + offset : undefined,
    franchiseTitles: franchiseTitles.length > 0 ? franchiseTitles : undefined,
    expectedSeason: season,
    expectedPart: part,
  };
}

/** Episode numbers worth searching for: the per-entry number and, if known, the absolute one. */
export function searchEpisodes(ctx: SearchContext): Array<number | undefined> {
  if (ctx.type === "movie" || ctx.episode === undefined) return [undefined];
  return ctx.absoluteEpisode !== undefined ? [ctx.episode, ctx.absoluteEpisode] : [ctx.episode];
}

/** "Sousou no Frieren" + episode 5 → "Sousou no Frieren 05". Movies get the bare title. */
export function titleWithEpisode(title: string, ctx: SearchContext, episode: number | undefined): string {
  if (ctx.type === "movie" || episode === undefined) return title;
  return `${title} ${String(episode).padStart(2, "0")}`;
}
