import { sanitizeTitle } from "../metadata/searchTerms.js";

/** Leading "[Group]" / "【Group】" / "(Group)" tags. */
const LEADING_TAGS = /^\s*(?:\[[^\]]*\]|【[^】]*】|\([^)]*\)|★[^★]*★)\s*/;

/** Where the show name ends: " - 05", " - S02E05", "[...", "(...", "S02E05", " E05". */
const HEAD_END = /\s[-–]\s+(?=[SE]?\d)|[[(【]|\bS\d{1,2}E\d{1,4}\b|\sE\d{1,4}\b/i;

/** Tokens that may appear next to a show name without making it a different show. */
const IGNORABLE_TOKEN =
  /^(?:\d{1,4}(?:v\d)?|s\d{1,2}|s\d{1,2}e\d{1,4}|e\d{1,4}|\d{1,2}(?:st|nd|rd|th)|season|part|cour|ii|iii|iv|vi|tv|movie|gekijouban|ova|ona|uncensored|end)$/;

/** Extra, non-ignorable words allowed after the show name before it counts as another show. */
const extraAllowance = (titleLength: number): number => (titleLength >= 4 ? 2 : 1);

function tokenize(text: string): string[] {
  return sanitizeTitle(text)
    .toLowerCase()
    .replace(/'/g, "")
    // "Thousand-Year" and "Thousand Year" are the same words.
    .replace(/-/g, " ")
    .split(" ")
    // Lone punctuation such as the "-" in "[Doomdos] - Bleach …" is not a word.
    .filter((token) => /[\p{L}\p{N}]/u.test(token));
}

function runAt(tokens: string[], at: number, run: string[]): boolean {
  return run.length > 0 && run.every((token, i) => tokens[at + i] === token);
}

/**
 * Does this release name denote the searched show? It must start with one of
 * the titles (ignorable tokens aside); after that, other title variants may
 * appear ("Your Name - Kimi no Na wa") plus at most a word or two of extras.
 */
function nameMatches(name: string[], titles: string[][]): boolean {
  const byLength = [...titles].sort((a, b) => b.length - a.length);
  let firstMatchLength = 0;
  let extras = 0;
  for (let at = 0; at < name.length; ) {
    const run = byLength.find((title) => runAt(name, at, title));
    if (run) {
      firstMatchLength ||= run.length;
      at += run.length;
      continue;
    }
    const token = name[at]!;
    at++;
    if (IGNORABLE_TOKEN.test(token)) continue;
    // A non-title word before the title means another show ("Koisuru One Piece").
    if (!firstMatchLength) return false;
    extras++;
  }
  return firstMatchLength > 0 && extras <= extraAllowance(firstMatchLength);
}

/** The show-name part of a release title, split into its alternative names. */
export function releaseNames(releaseTitle: string): string[] {
  let text = releaseTitle;
  // Scene-style dotted names have no spaces.
  if (!text.includes(" ")) text = text.replace(/[._]/g, " ");
  text = text.replace(/_/g, " ");
  while (LEADING_TAGS.test(text)) text = text.replace(LEADING_TAGS, "");

  const end = HEAD_END.exec(text);
  const head = end ? text.slice(0, end.index) : text;
  // "葬送的芙莉蓮 / Sousou no Frieren", "Sousou no Frieren | Frieren: Beyond Journey's End"
  return head
    .split(/\s[/|]\s/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Guard against releases of a *different* show whose name contains the one
 * searched for, e.g. "Sousou no Frieren - Marumaru no Mahou (Mini Anime) - 05"
 * when looking for "Sousou no Frieren", or "Koisuru One Piece" / "One Piece:
 * Gyojin Tou-hen" when looking for "One Piece".
 */
export function isRelevantRelease(releaseTitle: string, searchTitles: string[]): boolean {
  const titles = searchTitles.map(tokenize).filter((t) => t.length > 0);
  if (titles.length === 0) return false;
  return releaseNames(releaseTitle).some((name) => nameMatches(tokenize(name), titles));
}
