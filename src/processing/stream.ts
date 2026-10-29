import type { Stream } from "@stremio-addon/sdk";
import type { NormalizedTorrent, SourceName } from "../types.js";

const SOURCE_LABELS: Record<SourceName, string> = {
  animegarden: "Anime Garden",
  nyaa: "Nyaa",
  tokyotosho: "Tokyo Toshokan",
  nekobt: "nekoBT",
};

/**
 * Public trackers added to every stream. Anime Garden magnets usually carry no
 * trackers at all, so without these Stremio would rely on DHT alone.
 */
const FALLBACK_TRACKERS = [
  "http://nyaa.tracker.wf:7777/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
];

export function formatBytes(bytes: number | null): string | null {
  if (bytes === null) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

/** Tidy a release title for display: drop the extension, fix "_" and dotted names. */
export function cleanTitle(title: string): string {
  let clean = title.replace(/\.(?:mkv|mp4|avi|webm)$/i, "").replace(/_/g, " ");
  // Scene-style "Show.Name.S01E05" → spaces; dots between two digits ("5.1") stay.
  if (!clean.includes(" ")) clean = clean.replace(/\.(?!\d)|(?<!\d)\./g, " ");
  return clean.replace(/\s+/g, " ").trim();
}

/** Build a Stremio stream object. Only Stremio-playable (http/udp) trackers are used. */
export function toStremioStream(torrent: NormalizedTorrent): Stream {
  const kind = torrent.isDub ? "Dubbed" : "Subbed";
  const nameParts = [kind];
  if (torrent.resolution) nameParts.push(`${torrent.resolution}p`);
  nameParts.push(torrent.seeders === null ? "? seeders" : `${torrent.seeders} seeders`);

  const details = [formatBytes(torrent.sizeBytes), SOURCE_LABELS[torrent.source]].filter(Boolean);
  const trackers = [...new Set([...torrent.trackers, ...FALLBACK_TRACKERS])].filter((tr) =>
    /^(?:udp|https?):\/\//i.test(tr),
  );

  return {
    name: nameParts.join(" | "),
    title: `${cleanTitle(torrent.title)}\n${details.join(" · ")}`,
    infoHash: torrent.infoHash,
    // fileIdx is intentionally omitted: batches are filtered out, so each
    // torrent is a single episode or movie, and Stremio then picks the largest
    // file. A fixed 0 would play an NFO or sample file whenever one sorts first.
    sources: [...trackers.map((tr) => `tracker:${tr}`), `dht:${torrent.infoHash}`],
    behaviorHints: {
      bingeGroup: `anime-stremio-local|${torrent.isDub ? "dub" : "sub"}|${torrent.resolution ?? "unknown"}`,
    },
  };
}
