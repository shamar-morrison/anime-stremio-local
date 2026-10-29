import type { NormalizedTorrent, RawTorrent } from "../types.js";
import { buildMagnet, extractInfoHash, extractTrackers, normalizeInfoHash } from "../utils/magnet.js";
import { isDub } from "./classify.js";

const UNIT_POWERS: Record<string, number> = { B: 0, K: 1, M: 2, G: 3, T: 4 };

/** "1.4 GiB", "5.29GB", "700 MB" → bytes. Decimal and binary units are both treated as 1024-based. */
export function parseSize(size: number | string | undefined): number | null {
  if (typeof size === "number") return Number.isFinite(size) && size > 0 ? size : null;
  if (!size) return null;
  const match = /([\d.,]+)\s*([KMGT]?)(?:i?B)?/i.exec(size.trim());
  if (!match) return null;
  const value = Number.parseFloat(match[1]!.replace(/,/g, ""));
  const power = UNIT_POWERS[(match[2] || "B").toUpperCase()] ?? 0;
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1024 ** power) : null;
}

/** Vertical resolution from a release title, or null when none is stated. */
export function parseResolution(title: string): number | null {
  const p = /\b(2160|1440|1080|720|576|540|480|360)[pi]\b/i.exec(title);
  if (p) return Number(p[1]);
  const wh = /\b\d{3,4}\s*[x×]\s*(2160|1440|1080|720|576|540|480|360)\b/i.exec(title);
  if (wh) return Number(wh[1]);
  if (/\b(?:4k|uhd)\b/i.test(title)) return 2160;
  return null;
}

/** Convert a provider result to the common shape; null when no info hash can be found. */
export function normalizeTorrent(raw: RawTorrent): NormalizedTorrent | null {
  const infoHash = extractInfoHash(raw.magnet) ?? normalizeInfoHash(raw.infoHash);
  if (!infoHash) return null;

  const title = raw.title.trim();
  return {
    infoHash,
    title,
    magnet: raw.magnet ?? buildMagnet(infoHash, title),
    sizeBytes: parseSize(raw.size),
    seeders: typeof raw.seeders === "number" && raw.seeders >= 0 ? raw.seeders : null,
    leechers: typeof raw.leechers === "number" && raw.leechers >= 0 ? raw.leechers : null,
    resolution: parseResolution(title),
    source: raw.source,
    // Title keywords first; a source-declared English audio track also counts.
    isDub: isDub(title) || (raw.audioLangs ?? []).some((code) => /^en\b/.test(code)),
    batch: raw.batch === true,
    trackers: extractTrackers(raw.magnet),
  };
}
