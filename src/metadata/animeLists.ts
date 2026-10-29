import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createLogger } from "../utils/logger.js";
import { fetchWithTimeout } from "../utils/timeout.js";

const log = createLogger("anime-lists");

/** Community-maintained ID mapping (IMDb / TVDB / MAL / AniList / Kitsu …), updated several times a week. */
const LIST_URL = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json";
const CACHE_DIR = fileURLToPath(new URL("../../.cache/", import.meta.url));
const CACHE_FILE = `${CACHE_DIR}anime-list-full.json`;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
/** After a failed first load, don't retry the download on every request. */
const RETRY_AFTER_MS = 10 * 60 * 1000;

export interface MappedEntry {
  kitsuId: string;
  /** TV, MOVIE, OVA, ONA, SPECIAL */
  type?: string;
  /** TVDB season this entry belongs to, when the list knows it. */
  tvdbSeason?: number;
}

interface RawEntry {
  imdb_id?: string[] | string | null;
  kitsu_id?: number | null;
  type?: string;
  season?: { tvdb?: number; tmdb?: number } | null;
}

type Index = Map<string, MappedEntry[]>;

let index: Index | null = null;
let loadedAt = 0;
let loading: Promise<Index | null> | null = null;
let failedAt = 0;

function buildIndex(raw: RawEntry[]): Index {
  const map: Index = new Map();
  for (const entry of raw) {
    if (!entry.kitsu_id || !entry.imdb_id) continue;
    const imdbIds = Array.isArray(entry.imdb_id) ? entry.imdb_id : [entry.imdb_id];
    const mapped: MappedEntry = {
      kitsuId: String(entry.kitsu_id),
      type: entry.type,
      tvdbSeason: entry.season?.tvdb,
    };
    for (const imdbId of imdbIds) {
      if (!/^tt\d+$/.test(imdbId)) continue;
      const list = map.get(imdbId);
      if (list) list.push(mapped);
      else map.set(imdbId, [mapped]);
    }
  }
  return map;
}

async function readCache(): Promise<{ data: RawEntry[]; ageMs: number } | null> {
  try {
    const info = await stat(CACHE_FILE);
    const data = JSON.parse(await readFile(CACHE_FILE, "utf8")) as RawEntry[];
    return { data, ageMs: Date.now() - info.mtimeMs };
  } catch {
    return null;
  }
}

async function download(): Promise<RawEntry[]> {
  const started = Date.now();
  const res = await fetchWithTimeout(LIST_URL, {}, DOWNLOAD_TIMEOUT_MS);
  const text = await res.text();
  const data = JSON.parse(text) as RawEntry[];
  if (!Array.isArray(data) || data.length < 1000) throw new Error("anime list looks truncated");
  await mkdir(CACHE_DIR, { recursive: true });
  // Write-then-rename so a crash never leaves a half-written cache.
  await writeFile(`${CACHE_FILE}.tmp`, text);
  await rename(`${CACHE_FILE}.tmp`, CACHE_FILE);
  log.info("downloaded", { entries: data.length, ms: Date.now() - started });
  return data;
}

function install(data: RawEntry[]): Index {
  index = buildIndex(data);
  loadedAt = Date.now();
  log.info("ready", { imdbIds: index.size });
  return index;
}

async function load(): Promise<Index | null> {
  const cached = await readCache();
  if (cached && cached.ageMs < MAX_AGE_MS) return install(cached.data);
  try {
    return install(await download());
  } catch (err) {
    if (cached) {
      log.warn("refresh failed; using older cached copy", { err });
      return install(cached.data);
    }
    log.error("unavailable; IMDb (Cinemeta) titles can only use the name-search fallback", { err });
    failedAt = Date.now();
    return null;
  }
}

/**
 * The IMDb → Kitsu index. Loaded from the disk cache when fresh, otherwise
 * downloaded. A stale in-memory copy keeps serving while a refresh runs.
 */
export async function getAnimeLists(): Promise<Index | null> {
  if (index && Date.now() - loadedAt > MAX_AGE_MS && !loading) {
    loading = load().finally(() => (loading = null));
  }
  if (index) return index;
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return null;
  loading ??= load().finally(() => (loading = null));
  return loading;
}

/** Kitsu entries mapped to an IMDb id (empty when unknown or the list is unavailable). */
export async function lookupImdb(imdbId: string): Promise<MappedEntry[]> {
  const lists = await getAnimeLists();
  return lists?.get(imdbId) ?? [];
}
