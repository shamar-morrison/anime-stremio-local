export type SourceName = "animegarden" | "nyaa" | "tokyotosho" | "nekobt";

/** Source priority used for tie-breaks: lower index wins. */
export const SOURCE_PRIORITY: readonly SourceName[] = ["animegarden", "nyaa", "tokyotosho", "nekobt"];

/** A torrent exactly as a provider returned it, before any processing. */
export interface RawTorrent {
  source: SourceName;
  title: string;
  magnet?: string;
  /** Some sources expose the hash separately from the magnet. */
  infoHash?: string;
  /** Bytes (number) or a human-readable string such as "1.4 GiB". */
  size?: number | string;
  seeders?: number;
  leechers?: number;
  /** Source-specific category label, e.g. "Anime - English-translated". */
  category?: string;
  date?: Date;
  /** Structured metadata, when a source provides it (nekoBT): ISO-ish language codes. */
  subtitleLangs?: string[];
  audioLangs?: string[];
  /** Source says this is a multi-episode batch. */
  batch?: boolean;
}

/** Common internal shape after normalization. */
export interface NormalizedTorrent {
  infoHash: string;
  title: string;
  magnet: string;
  sizeBytes: number | null;
  /** null when the source does not report seeders. */
  seeders: number | null;
  leechers: number | null;
  /** Vertical resolution (2160, 1080, ...) or null when unknown. */
  resolution: number | null;
  source: SourceName;
  isDub: boolean;
  /** Source says this is a multi-episode batch (title parsing may still miss it). */
  batch: boolean;
  trackers: string[];
}

export interface SearchContext {
  kitsuId: string;
  type: "series" | "movie";
  /** Sanitized title variants to search with, most important first. */
  titles: string[];
  /** Requested episode (series only), numbered within this Kitsu entry. */
  episode?: number;
  /**
   * The same episode numbered from the start of the franchise, when earlier
   * cours exist (Bleach TYBW "Kashin-tan" episode 1 is released as "- 41").
   */
  absoluteEpisode?: number;
  /**
   * Names of the first cour of the franchise ("BLEACH Sennen Kessen-hen",
   * "BLEACH Thousand-Year Blood War"). Releases numbered with the absolute
   * episode often use these instead of the cour's own name.
   */
  franchiseTitles?: string[];
  /** Season implied by the Kitsu entry title (Kitsu entries are per-season). */
  expectedSeason: number;
  /** Split-cour part implied by the Kitsu entry title ("Part 2", "Cour 2"). */
  expectedPart: number;
}

export interface Provider {
  name: SourceName;
  /** Search one term. Errors propagate; the runner handles them. */
  search(term: string, ctx: SearchContext): Promise<RawTorrent[]>;
  /** Build the provider-specific query string for a title and episode number. */
  buildQuery(title: string, ctx: SearchContext, episode: number | undefined): string;
}

export interface KitsuAnime {
  id: string;
  canonicalTitle: string;
  titles: {
    en?: string;
    en_jp?: string;
    ja_jp?: string;
  };
  abbreviatedTitles: string[];
  subtype?: string;
  episodeCount?: number | null;
  /** ISO date (YYYY-MM-DD). */
  startDate?: string | null;
}
