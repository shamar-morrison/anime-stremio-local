import type { RawTorrent } from "../types.js";

/**
 * Markers used by Chinese fansub releases (Anime Garden is mostly dmhy /
 * bangumi.moe / mikan). Japanese characters alone are NOT a reason to reject:
 * many English releases include the Japanese title.
 */
const CHINESE_MARKERS =
  /字幕|汉化|漢化|简|繁|中字|中文|内封|內封|内嵌|內嵌|外挂|外掛|双语|雙語|新番|招募|翻译|翻譯|搬运|搬運|生肉|熟肉/;

/**
 * Bracket-style Chinese tags such as [GB], [BIG5], [CHS], [JPTC]. "Baha"
 * (Bahamut Anime Crazy) rips carry burned-in Chinese subtitles.
 */
const CHINESE_TAGS =
  /(?:^|[\s[\](){}_.\-【】&+])(?:GB|BIG5|CHS|CHT|CHI|JPSC|JPTC|GB_CN|BIG5_TW|Baha)(?=$|[\s[\](){}_.\-【】&+])/i;

function isNyaaEnglish(category: string | undefined): boolean {
  if (!category) return false;
  return /english-translated/i.test(category) && !/non-english/i.test(category);
}

const TOKYOTOSHO_KEEP = new Set(["anime", "batch"]);

/** "en", "enm" (English, modified/fansub variant), "en-us"… */
const isEnglishCode = (code: string): boolean => /^en(?:m|-[a-z]+)?$/.test(code);

/** Keep English-subbed or English-dubbed releases only. */
export function isEnglishRelease(raw: RawTorrent): boolean {
  if (CHINESE_MARKERS.test(raw.title) || CHINESE_TAGS.test(raw.title)) return false;

  switch (raw.source) {
    case "nyaa":
      // Drops Non-English-translated, Raw and Anime Music Video.
      return isNyaaEnglish(raw.category);
    case "tokyotosho":
      // Drops Non-English, Raws, Music, etc.
      return raw.category ? TOKYOTOSHO_KEEP.has(raw.category.trim().toLowerCase()) : true;
    case "nekobt":
      // Structured languages: English subtitles (fansub or official) or an English audio track.
      return [...(raw.subtitleLangs ?? []), ...(raw.audioLangs ?? [])].some(isEnglishCode);
    case "animegarden":
      return true;
  }
}
