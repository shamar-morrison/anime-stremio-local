import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAudio } from "../src/processing/classify.js";

describe("classifyAudio", () => {
  const dubbed = [
    "[Yameii] Frieren: Beyond Journey's End - S02E05 [English Dub] [CR WEB-DL 1080p H264 AAC]",
    "Spy x Family - 03 [Dub]",
    "Spy x Family - 03 Dubbed 1080p",
    "Spy x Family - 03 (Eng Dub)",
    "Spy.x.Family.S01E03.EngDub.1080p",
    "[Judas] Kimi no Na Wa. [BD 2160p][Dual-Audio][Multi-Subs]",
    "[MTBB] Your Name. (Dual Audio) (BD 1080p)",
    "[ToonsHub] Frieren - 05 (Multi-Audio 1080p x264 AAC)",
  ];
  const subbed = [
    "[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5].mkv",
    "[Erai-raws] Sousou no Frieren - 05 [1080p][Multiple Subtitle]",
    "Frieren - 05 [English Sub]",
    "Frieren - 05 Subbed",
    "Dubai Detective - 05 [1080p]", // "Dub" inside a word is not a dub
    "[9volt] Sousou no Frieren - 05",
  ];

  for (const title of dubbed) {
    it(`dub: ${title}`, () => assert.equal(classifyAudio(title), "dub"));
  }
  for (const title of subbed) {
    it(`sub: ${title}`, () => assert.equal(classifyAudio(title), "sub"));
  }

  it("dub keywords win over sub keywords", () => {
    assert.equal(classifyAudio("Show - 01 [Eng Dub + Eng Sub]"), "dub");
  });
});
