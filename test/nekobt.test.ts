import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWanted } from "../src/addon.js";
import { buildSearchContext } from "../src/metadata/searchTerms.js";
import { isEnglishRelease } from "../src/processing/language.js";
import { normalizeTorrent } from "../src/processing/normalize.js";
import { buildQueries } from "../src/providers/index.js";
import { nekoBt, parseNekoResults } from "../src/providers/nekobt.js";
import type { KitsuAnime, NormalizedTorrent } from "../src/types.js";

const HEX = "c2d4dc4fc185b960a5bdd7cef7bb6b0810814aa8";

// Trimmed from a real nekoBT /api/v1/torrents/search response.
const response = {
  error: false,
  data: {
    results: [
      {
        title: "[VARYG] BLEACH Thousand Year Blood War S01E41 GOD OF THUNDER 1080p DSNP WEB-DL DUAL AAC2.0 H.264",
        infohash: HEX,
        magnet: `magnet:?xt=urn:btih:${HEX}&tr=udp%3A%2F%2Ftracker.example%3A1337%2Fannounce`,
        filesize: "1449000000",
        seeders: "31",
        leechers: "2",
        fsub_lang: "",
        sub_lang: "en,de,es-419",
        audio_lang: "ja,en",
        batch: false,
        uploaded_at: 1787099818069,
      },
      { title: "Bleach S17E41 SUBFRENCH 1080p", infohash: HEX, fsub_lang: "", sub_lang: "fr-fr", audio_lang: "ja" },
      { title: "[Group] Show (01-12) [Batch]", infohash: HEX, fsub_lang: "en", audio_lang: "ja", batch: true },
      { title: "deleted one", infohash: HEX, deleted: "2026-01-01" },
    ],
  },
};

describe("nekoBT", () => {
  const [dual, french, batch, ...rest] = parseNekoResults(response);

  it("parses results and skips deleted ones", () => {
    assert.equal(rest.length, 0);
    assert.equal(dual?.source, "nekobt");
    assert.equal(dual?.seeders, 31);
    assert.equal(dual?.size, 1449000000);
    assert.deepEqual(dual?.subtitleLangs, ["en", "de", "es-419"]);
    assert.deepEqual(dual?.audioLangs, ["ja", "en"]);
    assert.equal(batch?.batch, true);
  });

  it("throws on API errors", () => {
    assert.throws(() => parseNekoResults({ error: true, message: "rate limited" }), /rate limited/);
  });

  it("keeps only releases with English subtitles or audio", () => {
    assert.equal(isEnglishRelease(dual!), true);
    assert.equal(isEnglishRelease(french!), false);
    assert.equal(isEnglishRelease(batch!), true);
  });

  it("classifies English audio as Dubbed and carries the batch flag", () => {
    assert.equal(normalizeTorrent(dual!)?.isDub, true);
    assert.equal(normalizeTorrent(batch!)?.batch, true);
  });
});

describe("franchise-named releases of later cours", () => {
  const anime = (id: string, canonicalTitle: string, en: string, episodeCount: number): KitsuAnime => ({
    id,
    canonicalTitle,
    titles: { en_jp: canonicalTitle, en },
    abbreviatedTitles: [],
    subtype: "TV",
    episodeCount,
  });
  const root = anime("43078", "BLEACH: Sennen Kessen-hen", "BLEACH: Thousand-Year Blood War", 13);
  const kashin = anime(
    "49444",
    "BLEACH: Sennen Kessen-hen - Kashin-tan",
    "BLEACH: Thousand-Year Blood War Part 4 - The Calamity",
    10,
  );
  const ctx = buildSearchContext(kashin, "series", 1, { offset: 40, root });
  const torrent = (title: string, batch = false): NormalizedTorrent => ({
    ...normalizeTorrent({ source: "nekobt", title, infoHash: HEX })!,
    batch,
  });

  it("accepts the franchise name only with the absolute episode", () => {
    assert.ok(isWanted(torrent("[VARYG] BLEACH Thousand Year Blood War S01E41 GOD OF THUNDER 1080p"), ctx));
    assert.ok(isWanted(torrent("[DKB] Bleach - Sennen Kessen-hen Kashin-tan - 41 [1080p]"), ctx));
    assert.ok(isWanted(torrent("[SubsPlease] Bleach - Sennen Kessen-hen - Kashin-tan - 01 (1080p)"), ctx));
    // Franchise name + per-cour number would be cour 1's episode 1.
    assert.ok(!isWanted(torrent("[Lazy] Bleach Thousand-Year Blood War - 01 [F35ABDE5]"), ctx));
    assert.ok(!isWanted(torrent("[VARYG] BLEACH Thousand Year Blood War S01E42 1080p"), ctx));
  });

  it("drops source-flagged batches", () => {
    assert.ok(!isWanted(torrent("[DKB] Bleach - Sennen Kessen-hen Kashin-tan - 41 [1080p]", true), ctx));
  });

  it("searches the franchise name with the absolute episode", () => {
    assert.deepEqual(buildQueries(nekoBt, ctx), [
      "BLEACH Sennen Kessen-hen Kashin-tan 01",
      "BLEACH Sennen Kessen-hen Kashin-tan 41",
      "BLEACH Thousand-Year Blood War Part 4 The Calamity 01",
      "BLEACH Thousand-Year Blood War Part 4 The Calamity 41",
      "BLEACH Sennen Kessen-hen 41",
      "BLEACH Thousand-Year Blood War 41",
    ]);
  });
});
