import type { NormalizedTorrent } from "../types.js";
import { sourceRank } from "./dedupe.js";

/** Seeders desc → resolution desc (unknown last) → source priority. */
export function compareTorrents(a: NormalizedTorrent, b: NormalizedTorrent): number {
  const seeders = (b.seeders ?? -1) - (a.seeders ?? -1);
  if (seeders !== 0) return seeders;
  const resolution = (b.resolution ?? 0) - (a.resolution ?? 0);
  if (resolution !== 0) return resolution;
  return sourceRank(a) - sourceRank(b);
}

/**
 * Final ordering: every Subbed stream first, then every Dubbed stream. Each
 * block is sorted by seeders, then resolution. Stremio has no collapsible
 * stream sections, so the two blocks are how the list stays organized.
 */
export function sortTorrents(torrents: NormalizedTorrent[]): NormalizedTorrent[] {
  const subbed = torrents.filter((t) => !t.isDub).sort(compareTorrents);
  const dubbed = torrents.filter((t) => t.isDub).sort(compareTorrents);
  return [...subbed, ...dubbed];
}
