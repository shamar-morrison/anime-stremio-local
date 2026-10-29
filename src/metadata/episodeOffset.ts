import type { KitsuAnime } from "../types.js";
import { createLogger } from "../utils/logger.js";
import { fetchPrequels, isSeriesEntry } from "./kitsu.js";
import { inferSeasonPart, titleTokens } from "./searchTerms.js";

const log = createLogger("offset");

/** Hard stop for very long franchises; each hop is one (cached) Kitsu request. */
const MAX_PREQUEL_HOPS = 8;

export interface Continuation {
  /** Episodes aired in earlier cours of the same run. */
  offset: number;
  /** The run's first cour (its names are what absolute-numbered releases use). */
  root?: KitsuAnime;
}

const continuations = new Map<string, Continuation>();

function commonPrefix(a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) out.push(a[i]!);
  return out;
}

function startsWith(tokens: string[], prefix: string[]): boolean {
  return prefix.every((token, i) => tokens[i] === token);
}

/**
 * Episodes aired before this entry within the same run of cours, so releases
 * that keep counting across cours can be matched. Examples:
 *   BLEACH: Sennen Kessen-hen - Kashin-tan → 13 + 13 + 14 = 40 (its episode 1 is released as "- 41")
 *   SPY x FAMILY Part 2                     → 12
 *   Sousou no Frieren 2nd Season            → 0 (new season: releases restart at 01)
 *
 * The walk follows prequels while they keep the same season number and share
 * a franchise name prefix of at least two words with this entry, so
 * "BLEACH: Sennen Kessen-hen" does not count the original 2004 "BLEACH", and
 * "Naruto: Shippuuden" does not count "Naruto" (both restart at 01).
 * Returns offset 0 when nothing applies or anything is unknown.
 */
export async function fetchContinuation(anime: KitsuAnime): Promise<Continuation> {
  const cached = continuations.get(anime.id);
  if (cached) return cached;

  const { season } = inferSeasonPart(anime);
  const baseTokens = titleTokens(anime.canonicalTitle);
  let prefix: string[] | null = null;
  let offset = 0;
  let root: KitsuAnime | undefined;
  let current = anime;

  try {
    for (let hop = 0; hop < MAX_PREQUEL_HOPS; hop++) {
      const prequels = await fetchPrequels(current.id);
      const next = prequels.find(isSeriesEntry) ?? prequels[0];
      if (!next) break;

      if (isSeriesEntry(next)) {
        if (inferSeasonPart(next).season !== season) break;
        const tokens = titleTokens(next.canonicalTitle);
        prefix ??= commonPrefix(baseTokens, tokens);
        const minPrefix = Math.min(2, baseTokens.length);
        if (prefix.length === 0 || prefix.length < minPrefix || !startsWith(tokens, prefix)) break;
        if (!next.episodeCount) {
          // An unknown count anywhere makes the sum meaningless.
          offset = 0;
          root = undefined;
          break;
        }
        offset += next.episodeCount;
        root = next;
      }
      // Non-series prequels (movies, recaps) are stepped over without counting.
      current = next;
    }
  } catch (err) {
    log.warn("prequel lookup failed; using per-entry numbering only", { kitsuId: anime.id, err });
    return { offset: 0 };
  }

  const result: Continuation = offset > 0 ? { offset, root } : { offset: 0 };
  continuations.set(anime.id, result);
  if (offset > 0) {
    log.info("episode offset", { kitsuId: anime.id, title: anime.canonicalTitle, offset, root: root?.canonicalTitle });
  }
  return result;
}
