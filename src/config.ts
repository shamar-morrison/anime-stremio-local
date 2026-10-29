function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  host: "127.0.0.1",
  port: intFromEnv("PORT", 7000),
  /** Hard timeout for a single provider search. */
  sourceTimeoutMs: intFromEnv("SOURCE_TIMEOUT_MS", 15_000),
  /** Timeout for Kitsu metadata lookups. */
  kitsuTimeoutMs: intFromEnv("KITSU_TIMEOUT_MS", 10_000),
  /** How long Kitsu responses stay in the in-memory cache. */
  kitsuCacheTtlMs: 60 * 60 * 1000,
  /** Maximum distinct title variants searched per provider. */
  maxTitleVariants: 2,
  userAgent: "anime-stremio-local/1.0 (+self-hosted Stremio addon)",
} as const;
