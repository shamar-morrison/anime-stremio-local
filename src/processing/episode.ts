import { ROMAN_NUMERALS } from "../metadata/searchTerms.js";
import type { SearchContext } from "../types.js";

export interface EpisodeInfo {
  season?: number;
  /** Split-cour part: "Cour 2", "Part 2". */
  part?: number;
  episode?: number;
  /** True when the episode came from an explicit marker (S01E05, Episode 5, 第5話). */
  explicit: boolean;
  isBatch: boolean;
}

/** Tokens that contain digits but are never episode numbers. */
const NOISE_PATTERNS: RegExp[] = [
  /\[[0-9A-F]{8}\]/gi, // CRC32: [44786BE6]
  /\(\s*[0-9A-F]{8}\s*\)/gi,
  /\b\d{3,4}x\d{3,4}\b/gi, // 1920x1080
  /\b\d{3,4}[pi]\b/gi, // 1080p, 1080i
  /\b4k\b/gi,
  /\b[xh]\.?26[45]\b/gi, // x264, H.265
  /\b(?:hevc|avc|av1|vvc|xvid|vp9)\b/gi,
  /\b\d{1,2}[-\s]?bits?\b/gi, // 10bit, 10-bit
  /\b(?:aac|ac3|eac3|e-ac-3|ddp?|flac|opus|mp3|dts|truehd|xhe-aac)\s*(?:x\d)?(?:\s*\d\.\d)?\b/gi,
  /\b\d\.\d\b/g, // 2.0, 5.1
  /\b(?:srt|ass)x\d\b/gi,
  /[[(](?:19|20)\d{2}[\])]/g, // (2023), [2024]
  /\.(?:mkv|mp4|avi|webm)\b/gi,
];

const SEASON_PATTERNS: RegExp[] = [
  /\bS(\d{1,2})\s*E\d{1,4}/i,
  /\bS(\d{1,2})\b/i,
  /\b(\d{1,2})(?:st|nd|rd|th)\s+Season\b/i,
  /\bSeason\s*(\d{1,2})\b/i,
  /第(\d{1,2})季/,
];

const EXPLICIT_EPISODE_PATTERNS: RegExp[] = [
  /\bS\d{1,2}\s*E(\d{1,4})(?:v\d)?\b/i, // S02E05
  /\b(?:E|EP\.?\s*|Episode\s*)(\d{1,4})(?:v\d)?\b/i, // E05, Ep 05, Ep.05, Episode 5
  /第(\d{1,4})[話话集]/, // 第05話
];

const LOOSE_EPISODE_PATTERNS: RegExp[] = [
  /\s[-–]\s+(\d{1,4})(?:v\d)?(?=$|[\s[(.])/, // "Title - 05", "One Piece - 1075v2"
  /\[(\d{1,4})(?:v\d)?\]/, // "[05]"
  /【(\d{1,4})(?:v\d)?】/,
];

const BATCH_KEYWORDS = /\b(?:batch|complete(?:\s+series)?|bd\s*box)\b|全集|合集/i;

/**
 * Episode ranges: "01-12", "E01-E12", "S01-S02", "01 ~ 12", "01 to 12" and
 * bracketed "(01 - 28)". A bare " - " is NOT a range on its own: it is the
 * usual title/episode separator ("Kaiju No 8 - 09", "Frieren S2 - 05").
 */
const RANGE_PATTERNS: Array<{ pattern: RegExp; sameWidth?: boolean }> = [
  { pattern: /\b[SE]?(\d{1,4})(?:-|\s*~\s*|\s+to\s+)[SE]?(\d{1,4})\b/gi },
  { pattern: /[([]\s*(\d{1,4})\s*[-~]\s*(\d{1,4})\s*[)\]]/g },
  // "One Piece 901 - 910": spaced, so only when both numbers have the same
  // width; "Kaiju No 8 - 09" stays an episode.
  { pattern: /\b(\d{2,4})\s+-\s+(\d{2,4})\b/g, sameWidth: true },
];

const PART_RE = /\b(?:Part|Cour)\s*(\d)\b/i;

/** Roman-numeral sequels: "Mob Psycho 100 III - 05". */
const ROMAN_SEASON_RE = /\s(II|III|IV|V|VI)(?=\s+[-–]\s|\s*$|\s*[[(])/;

function stripNoise(title: string): string {
  let clean = ` ${title} `;
  for (const pattern of NOISE_PATTERNS) clean = clean.replace(pattern, " ");
  return clean.replace(/_/g, " ").replace(/\s+/g, " ");
}

function firstNumber(patterns: RegExp[], text: string): number | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return Number.parseInt(match[1], 10);
  }
  return undefined;
}

function hasEpisodeRange(text: string): boolean {
  for (const { pattern, sameWidth } of RANGE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (sameWidth && match[1]!.length !== match[2]!.length) continue;
      const from = Number.parseInt(match[1]!, 10);
      const to = Number.parseInt(match[2]!, 10);
      // Only increasing ranges count, so dates like "2026-10" are ignored.
      if (to > from) return true;
    }
  }
  return false;
}

/** "[E41 E42 E43]": several different explicit episode markers in one release. */
function hasMultipleEpisodes(text: string): boolean {
  const numbers = new Set<number>();
  for (const match of text.matchAll(/\b(?:S\d{1,2}\s*)?E(\d{1,4})(?:v\d)?\b/gi)) numbers.add(Number(match[1]));
  return numbers.size > 1;
}

function parseSeason(text: string): number | undefined {
  const season = firstNumber(SEASON_PATTERNS, text);
  if (season !== undefined) return season;
  const roman = ROMAN_SEASON_RE.exec(text)?.[1];
  return roman ? ROMAN_NUMERALS[roman] : undefined;
}

/** Extract season / episode / batch information from a release title. */
export function parseEpisodeInfo(title: string): EpisodeInfo {
  const clean = stripNoise(title);

  const isBatch = BATCH_KEYWORDS.test(clean) || hasEpisodeRange(clean) || hasMultipleEpisodes(clean);
  const season = parseSeason(clean);
  const part = firstNumber([PART_RE], clean);

  const explicitEpisode = firstNumber(EXPLICIT_EPISODE_PATTERNS, clean);
  if (explicitEpisode !== undefined) {
    return { season, part, episode: explicitEpisode, explicit: true, isBatch };
  }
  return { season, part, episode: firstNumber(LOOSE_EPISODE_PATTERNS, clean), explicit: false, isBatch };
}

/**
 * Whether a release matches the request.
 * - Series: must be a single episode. A release numbered with the absolute
 *   (franchise-wide) episode matches regardless of season/part markers, since
 *   those releases label seasons inconsistently ("S17E41", "S04E41", none).
 *   Otherwise it must carry the requested per-entry number, and a release
 *   with no season (or part/cour) marker counts as season 1 (part 1); an
 *   explicit marker must equal the one implied by the Kitsu entry. Batches
 *   are dropped: there is no reliable way to pick the right file inside them.
 * - Movies: anything except explicit episode releases.
 */
export function matchesRequest(info: EpisodeInfo, ctx: SearchContext): boolean {
  if (ctx.type === "movie" || ctx.episode === undefined) {
    return !(info.explicit && info.episode !== undefined && !info.isBatch);
  }
  if (info.isBatch || info.episode === undefined) return false;
  if (ctx.absoluteEpisode !== undefined && info.episode === ctx.absoluteEpisode) return true;
  if (info.episode !== ctx.episode) return false;
  return (info.season ?? 1) === ctx.expectedSeason && (info.part ?? 1) === ctx.expectedPart;
}
