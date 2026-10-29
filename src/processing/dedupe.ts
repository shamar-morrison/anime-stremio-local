import { SOURCE_PRIORITY, type NormalizedTorrent } from "../types.js";

export function sourceRank(torrent: NormalizedTorrent): number {
  return SOURCE_PRIORITY.indexOf(torrent.source);
}

/** True when `candidate` should replace `current` as the kept duplicate. */
function isBetter(candidate: NormalizedTorrent, current: NormalizedTorrent): boolean {
  const a = candidate.seeders ?? -1;
  const b = current.seeders ?? -1;
  if (a !== b) return a > b;
  return sourceRank(candidate) < sourceRank(current);
}

/**
 * Collapse results that share an info hash. The copy with the most seeders
 * wins; ties go to the preferred source (Anime Garden > Nyaa > Tokyo Toshokan).
 * Trackers from every copy are merged, since more trackers help peer discovery.
 */
export function dedupeByInfoHash(torrents: NormalizedTorrent[]): NormalizedTorrent[] {
  const byHash = new Map<string, NormalizedTorrent>();
  for (const torrent of torrents) {
    const current = byHash.get(torrent.infoHash);
    if (!current) {
      byHash.set(torrent.infoHash, torrent);
      continue;
    }
    const trackers = [...new Set([...current.trackers, ...torrent.trackers])];
    const kept = isBetter(torrent, current) ? torrent : current;
    byHash.set(torrent.infoHash, { ...kept, trackers });
  }
  return [...byHash.values()];
}
