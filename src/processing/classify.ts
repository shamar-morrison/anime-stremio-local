/** "Dub", "Dubbed", "Dubs", "English Dub", "Eng Dub", "EngDub", "Eng.Dub"… (not "Dubai"). */
const DUB_RE = /\b(?:eng(?:lish)?[\s._-]*)?dub(?:bed|s)?\b/i;
/** Dual/multi-audio releases ship an English dub track alongside the original. */
const MULTI_AUDIO_RE = /\b(?:dual|multi)[\s._-]?audio\b/i;
/** "Sub", "Subbed", "Subs", "English Sub", "Eng Sub"… (not "SubsPlease"). */
const SUB_RE = /\b(?:eng(?:lish)?[\s._-]*)?sub(?:bed|s)?\b/i;

export type AudioKind = "dub" | "sub";

/**
 * Classify a release as Subbed or Dubbed from its title.
 *  1. Dub keywords (or dual/multi-audio) → dub
 *  2. Sub keywords → sub
 *  3. Neither → sub (almost all anime releases are subbed)
 * Title keywords decide this, never the source. Nyaa's "English-translated"
 * category points the same way (sub unless a dub keyword is present), so it
 * needs no special case.
 */
export function classifyAudio(title: string): AudioKind {
  if (DUB_RE.test(title) || MULTI_AUDIO_RE.test(title)) return "dub";
  if (SUB_RE.test(title)) return "sub";
  return "sub";
}

export function isDub(title: string): boolean {
  return classifyAudio(title) === "dub";
}
