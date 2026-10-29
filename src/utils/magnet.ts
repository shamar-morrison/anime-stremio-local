const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode an RFC 4648 base32 string (no padding) to lowercase hex. */
export function base32ToHex(input: string): string | null {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/, "")) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize a BitTorrent v1 info hash to 40-char lowercase hex.
 * Accepts hex (40 chars) or base32 (32 chars), which Anime Garden and
 * Tokyo Toshokan commonly use. Returns null for anything else.
 */
export function normalizeInfoHash(hash: string | undefined | null): string | null {
  if (!hash) return null;
  const trimmed = hash.trim();
  if (/^[0-9a-f]{40}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^[a-z2-7]{32}$/i.test(trimmed)) {
    const hex = base32ToHex(trimmed);
    return hex && hex.length === 40 ? hex : null;
  }
  return null;
}

/** Extract the info hash from a magnet link's `xt=urn:btih:` parameter. */
export function extractInfoHash(magnet: string | undefined | null): string | null {
  if (!magnet) return null;
  const match = /xt=urn:btih:([a-z0-9]+)/i.exec(magnet);
  return normalizeInfoHash(match?.[1]);
}

/** Return the tracker URLs (`tr=` params) embedded in a magnet link. */
export function extractTrackers(magnet: string | undefined | null): string[] {
  if (!magnet) return [];
  const query = magnet.indexOf("?");
  if (query === -1) return [];
  try {
    const params = new URLSearchParams(magnet.slice(query + 1));
    return [...new Set(params.getAll("tr").filter((tr) => /^(udp|https?|wss?):\/\//i.test(tr)))];
  } catch {
    return [];
  }
}

/** Build a minimal magnet link from a hex info hash. */
export function buildMagnet(infoHash: string, name?: string): string {
  const dn = name ? `&dn=${encodeURIComponent(name)}` : "";
  return `magnet:?xt=urn:btih:${infoHash}${dn}`;
}
