import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEnglishRelease } from "../src/processing/language.js";
import { isRelevantRelease, releaseNames } from "../src/processing/relevance.js";
import type { RawTorrent } from "../src/types.js";

const raw = (title: string, source: RawTorrent["source"] = "animegarden", category?: string): RawTorrent => ({
  source,
  title,
  category,
});

describe("isEnglishRelease", () => {
  it("rejects Chinese fansub releases", () => {
    for (const title of [
      "[北宇治字幕组] 葬送的芙莉莲 / Sousou no Frieren [05][WebRip][1080p][HEVC_AAC][简日内嵌]",
      "【喵萌奶茶屋】★10月新番★[葬送的芙莉莲 / Sousou no Frieren][05][1080p][简日双语][招募翻译]",
      "[爱恋&漫猫字幕社][1月新番][Sousou no Frieren S2][05][1080P][GB][MP4]",
      "[Group] Sousou no Frieren - 05 [1080P][BIG5][MP4]",
      "[ANi] Sousou no Frieren - 05 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
    ]) {
      assert.equal(isEnglishRelease(raw(title)), false, title);
    }
  });

  it("keeps English releases, including ones with Japanese titles", () => {
    for (const title of [
      "[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5].mkv",
      "[GJ.Y] 葬送的芙莉蓮 / Sousou no Frieren - 05 (CR 1920x1080 AVC AAC MKV)",
      "[Koi] Sousou no Frieren - 05 「葬送のフリーレン」 [1080p]",
      "[Group] Show - 05 [1080p][5.29GB]", // "GB" inside a size is not a Chinese tag
    ]) {
      assert.equal(isEnglishRelease(raw(title)), true, title);
    }
  });

  it("uses Nyaa categories", () => {
    const t = "[Group] Show - 05 [1080p]";
    assert.equal(isEnglishRelease(raw(t, "nyaa", "Anime - English-translated")), true);
    assert.equal(isEnglishRelease(raw(t, "nyaa", "Anime - Non-English-translated")), false);
    assert.equal(isEnglishRelease(raw(t, "nyaa", "Anime - Raw")), false);
    assert.equal(isEnglishRelease(raw(t, "nyaa", "Anime - Anime Music Video")), false);
  });

  it("uses Tokyo Toshokan categories", () => {
    const t = "[Group] Show - 05 [1080p]";
    assert.equal(isEnglishRelease(raw(t, "tokyotosho", "Anime")), true);
    assert.equal(isEnglishRelease(raw(t, "tokyotosho", "Non-English")), false);
    assert.equal(isEnglishRelease(raw(t, "tokyotosho", "Raws")), false);
  });
});

describe("isRelevantRelease", () => {
  const titles = ["Sousou no Frieren", "Frieren Beyond Journey's End"];

  it("splits alternative names", () => {
    assert.deepEqual(releaseNames("[GJ.Y] 葬送的芙莉蓮 / Sousou no Frieren - 05 (CR 1920x1080)"), [
      "葬送的芙莉蓮",
      "Sousou no Frieren",
    ]);
  });

  it("accepts releases of the show under either title", () => {
    for (const title of [
      "[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5].mkv",
      "[SubsPlease] Sousou no Frieren S2 - 05 (1080p)",
      "[Erai-raws] Sousou no Frieren 2nd Season - 05 [1080p]",
      "[Yameii] Frieren: Beyond Journey's End - S02E05 [English Dub]",
      "[GJ.Y] 葬送的芙莉蓮 / Sousou no Frieren - 05 (CR 1920x1080 AVC AAC MKV)",
      "[Shroud] Frieren Beyond Journey`s End (Season 1) (Vol 05) [1080p]",
      "Frieren.Beyond.Journeys.End.S01E05.1080p.WEB.H264",
    ]) {
      assert.ok(isRelevantRelease(title, titles), title);
    }
  });

  it("rejects spin-offs whose name merely contains the title", () => {
    assert.ok(
      !isRelevantRelease("[Piyoko] Sousou no Frieren - Marumaru no Mahou (Mini Anime) - 05 [1080p]", titles),
    );
  });

  it("rejects other shows sharing a short title", () => {
    const onePiece = ["One Piece"];
    assert.ok(isRelevantRelease("[SubsPlease] One Piece - 1075 (1080p) [384F032D].mkv", onePiece));
    assert.ok(!isRelevantRelease("[Xera] Koisuru One Piece - 05 (1080p) [A0A209A1]", onePiece));
    assert.ok(!isRelevantRelease("[Erai-raws] One Piece: Gyojin Tou-hen - 05 [1080p CR WEBRip HEVC EAC3]", onePiece));
    assert.ok(
      !isRelevantRelease("[Judas] One Piece Gyojin Tou-hen ( Fish-Man Island Saga) - 05 [1080p]", onePiece),
    );
  });

  it("accepts releases that list both title variants", () => {
    const yourName = ["Kimi no Na wa", "Your Name"];
    for (const title of [
      "[TE] Your Name - Kimi no na wa [BD 2160p 4K UHD][HEVC x265 10bit]",
      "[MegaMTBB] Kimi no Na wa. (2016) (BD 1080p) | your name.",
      "[BDMV] [USA] Your Name (Kimi No Na Wa)",
      "YOUR NAME (2016) 2160P X265 DUAL AUDIO",
    ]) {
      assert.ok(isRelevantRelease(title, yourName), title);
    }
  });

  it("accepts multi-cour names and punctuation-only tokens", () => {
    const kashin = ["BLEACH Sennen Kessen-hen Kashin-tan", "BLEACH Thousand-Year Blood War Part 4 The Calamity"];
    assert.ok(isRelevantRelease("[DKB] Bleach - Sennen Kessen-hen Kashin-tan - 41 [1080p][HEVC x265 10bit]", kashin));
    assert.ok(isRelevantRelease("[Doomdos] - Bleach Sennen Kessen-hen - Kashin-tan - S01E50 [1080p]", kashin));
    assert.ok(!isRelevantRelease("[DKB] Bleach - Sennen Kessen-hen Soukoku-tan - 27 [1080p]", kashin));
  });

  it("rejects unrelated shows", () => {
    assert.ok(!isRelevantRelease("[SubsPlease] Dandadan - 05 (1080p)", titles));
  });
});
