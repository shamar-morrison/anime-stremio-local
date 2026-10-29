import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesRequest, parseEpisodeInfo } from "../src/processing/episode.js";
import type { SearchContext } from "../src/types.js";

const series = (episode: number, expectedSeason = 1, expectedPart = 1): SearchContext => ({
  kitsuId: "1",
  type: "series",
  titles: ["Show"],
  episode,
  expectedSeason,
  expectedPart,
});

describe("parseEpisodeInfo", () => {
  const cases: Array<[string, { season?: number; part?: number; episode?: number; isBatch: boolean }]> = [
    ["[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5].mkv", { episode: 5, isBatch: false }],
    ["[SubsPlease] Sousou no Frieren S2 - 05 (1080p) [6AAEC79A].mkv", { season: 2, episode: 5, isBatch: false }],
    ["[Erai-raws] Sousou no Frieren 2nd Season - 05 [1080p]", { season: 2, episode: 5, isBatch: false }],
    ["[Yameii] Frieren: Beyond Journey's End - S02E05 [English Dub]", { season: 2, episode: 5, isBatch: false }],
    ["[北宇治字幕组] 葬送的芙莉莲 / Sousou no Frieren [05][WebRip][1080p]", { episode: 5, isBatch: false }],
    ["[SubsPlease] One Piece - 1075v2 (1080p) [384F032D].mkv", { episode: 1075, isBatch: false }],
    ["Show.Name.S01E12.1080p.WEB.H264", { season: 1, episode: 12, isBatch: false }],
    ["[Group] Show - Episode 7 [720p]", { episode: 7, isBatch: false }],
    ["[Erai-raws] Spy x Family Cour 2 - 03 [1080p]", { part: 2, episode: 3, isBatch: false }],
    ["[SubsPlease] Kaiju No 8 - 09 (1080p)", { episode: 9, isBatch: false }],
    ["[SubsPlease] 86 - 05 (1080p)", { episode: 5, isBatch: false }],
    ["[SubsPlease] Mob Psycho 100 III - 05 (1080p)", { season: 3, episode: 5, isBatch: false }],
    // Batches
    ["[SubsPlease] Sousou no Frieren (01-28) (1080p) [Batch]", { isBatch: true }],
    ["[Majo] Sousou no Frieren - 01~05 [1080p]", { isBatch: true }],
    ["[Group] Show - 01 to 12 [BD 1080p]", { isBatch: true }],
    ["[Group] Show S01-S02 Complete [1080p]", { isBatch: true }],
    ["[Hatsuyuki] One Piece 901 - 910 [10bit][x265][1920x1080]", { isBatch: true }],
    ["[WonderhoyRips] BLEACH: Thousand-Year Blood War - The Calamity [E41 E42 E43] [720p]", { isBatch: true }],
    ["[Knight-Subs] Bleach Thousand-Year Blood War - E41v2 - GOD OF THUNDER (1080p)", { episode: 41, isBatch: false }],
    ["[Group] Show S01E41 (E41) [1080p]", { season: 1, episode: 41, isBatch: false }],
  ];

  for (const [title, expected] of cases) {
    it(title, () => {
      const info = parseEpisodeInfo(title);
      assert.equal(info.isBatch, expected.isBatch, "isBatch");
      if (!expected.isBatch) {
        assert.equal(info.episode, expected.episode, "episode");
        assert.equal(info.season, expected.season, "season");
        assert.equal(info.part, expected.part, "part");
      }
    });
  }

  it("ignores CRC, resolution, codec and year noise", () => {
    const info = parseEpisodeInfo("[Group] Show (2023) - 04 [1920x1080 HEVC 10-bit AAC 2.0][1080p][ABCD1234]");
    assert.equal(info.episode, 4);
    assert.equal(info.isBatch, false);
  });
});

describe("matchesRequest", () => {
  it("matches the requested episode in season 1 without a season marker", () => {
    assert.ok(matchesRequest(parseEpisodeInfo("[SubsPlease] Show - 05 (1080p)"), series(5)));
  });

  it("rejects other episodes", () => {
    assert.ok(!matchesRequest(parseEpisodeInfo("[SubsPlease] Show - 06 (1080p)"), series(5)));
  });

  it("rejects explicit other seasons", () => {
    assert.ok(!matchesRequest(parseEpisodeInfo("[SubsPlease] Show S2 - 05 (1080p)"), series(5)));
    assert.ok(matchesRequest(parseEpisodeInfo("[SubsPlease] Show S2 - 05 (1080p)"), series(5, 2)));
  });

  it("requires a season marker for season 2+ entries", () => {
    assert.ok(!matchesRequest(parseEpisodeInfo("[SubsPlease] Show - 05 (1080p)"), series(5, 2)));
  });

  it("respects split-cour parts", () => {
    const cour2 = parseEpisodeInfo("[Erai-raws] Show Cour 2 - 03 [1080p]");
    assert.ok(!matchesRequest(cour2, series(3)));
    assert.ok(matchesRequest(cour2, series(3, 1, 2)));
  });

  it("accepts absolute numbering regardless of season markers", () => {
    const ctx: SearchContext = { ...series(1), absoluteEpisode: 41 };
    for (const title of [
      "[DKB] Bleach - Sennen Kessen-hen Kashin-tan - 41 [1080p][HEVC x265 10bit][Multi-Subs][weekly]",
      "[AnoZu] Bleach S17E41 1080p CR WEB-DL DDP 2.0 H.264",
      "BLEACH Thousand Year Blood War S04E41 1080p CR WEB-DL AAC2.0 H.264-VARYG",
      "[SubsPlease] Bleach - Sennen Kessen-hen - Kashin-tan - 01 (1080p)",
    ]) {
      assert.ok(matchesRequest(parseEpisodeInfo(title), ctx), title);
    }
    assert.ok(!matchesRequest(parseEpisodeInfo("[DKB] Bleach - Sennen Kessen-hen Kashin-tan - 42 [1080p]"), ctx));
  });

  it("drops batches for episode requests", () => {
    assert.ok(!matchesRequest(parseEpisodeInfo("[Group] Show (01-12) [Batch]"), series(5)));
  });

  it("accepts movie releases but not explicit TV episodes for movies", () => {
    const movie: SearchContext = { ...series(1), type: "movie", episode: undefined };
    assert.ok(matchesRequest(parseEpisodeInfo("[MTBB] Kimi no Na wa. (2016) (BD 1080p)"), movie));
    assert.ok(!matchesRequest(parseEpisodeInfo("Kimi no Na wa S01E05 1080p"), movie));
  });
});
