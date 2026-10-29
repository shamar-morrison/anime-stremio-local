import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locateEpisode } from "../src/metadata/imdb.js";
import { parseStremioId } from "../src/metadata/kitsu.js";
import {
  buildSearchContext,
  sanitizeTitle,
  searchEpisodes,
  splitSeason,
  titleWithEpisode,
} from "../src/metadata/searchTerms.js";
import { parseTokyoToshoRss } from "../src/providers/tokyotosho.js";
import type { KitsuAnime } from "../src/types.js";

const anime = (canonicalTitle: string, en?: string, subtype = "TV", episodeCount?: number, id = "1"): KitsuAnime => ({
  id,
  canonicalTitle,
  titles: { en_jp: canonicalTitle, en },
  abbreviatedTitles: [],
  subtype,
  episodeCount,
});

describe("parseStremioId", () => {
  it("parses Anime Kitsu episode ids", () => {
    assert.deepEqual(parseStremioId("kitsu:46474:5"), { kind: "kitsu", kitsuId: "46474", episode: 5 });
  });

  it("parses kitsu:<id>:<season>:<episode>", () => {
    assert.deepEqual(parseStremioId("kitsu:12345:1:5"), {
      kind: "kitsu",
      kitsuId: "12345",
      season: 1,
      episode: 5,
    });
  });

  it("parses bare kitsu ids (movies)", () => {
    assert.deepEqual(parseStremioId("kitsu:11614"), { kind: "kitsu", kitsuId: "11614" });
  });

  it("parses Cinemeta (IMDb) ids", () => {
    assert.deepEqual(parseStremioId("tt14986406:4:1"), { kind: "imdb", imdbId: "tt14986406", season: 4, episode: 1 });
    assert.deepEqual(parseStremioId("tt5311514"), { kind: "imdb", imdbId: "tt5311514" });
  });

  it("rejects malformed ids", () => {
    assert.equal(parseStremioId("tt0388629:1").kind, "unsupported");
    assert.equal(parseStremioId("tt0388629:a:1").kind, "unsupported");
    assert.equal(parseStremioId("kitsu:abc:1").kind, "unsupported");
    assert.equal(parseStremioId("kitsu:1:x").kind, "unsupported");
    assert.equal(parseStremioId("kitsu:1:2:3:4").kind, "unsupported");
    assert.equal(parseStremioId("mal:1:2").kind, "unsupported");
  });
});

describe("search terms", () => {
  it("sanitizes punctuation", () => {
    assert.equal(sanitizeTitle("Frieren: Beyond Journey’s End"), "Frieren Beyond Journey's End");
    assert.equal(sanitizeTitle("SPY×FAMILY"), "SPY x FAMILY");
    assert.equal(sanitizeTitle("Kimi no Na wa."), "Kimi no Na wa");
  });

  it("splits season and part suffixes", () => {
    assert.deepEqual(splitSeason("Sousou no Frieren 2nd Season"), { base: "Sousou no Frieren", season: 2, part: 1 });
    assert.deepEqual(splitSeason("SPY x FAMILY Season 2"), { base: "SPY x FAMILY", season: 2, part: 1 });
    assert.deepEqual(splitSeason("SPY x FAMILY Part 2"), { base: "SPY x FAMILY", season: 1, part: 2 });
    assert.deepEqual(splitSeason("Shingeki no Kyojin Season 3 Part 2"), {
      base: "Shingeki no Kyojin",
      season: 3,
      part: 2,
    });
    assert.deepEqual(splitSeason("Mob Psycho 100 III"), { base: "Mob Psycho 100", season: 3, part: 1 });
    assert.deepEqual(splitSeason("JoJo no Kimyou na Bouken Part 5: Ougon no Kaze"), {
      base: "JoJo no Kimyou na Bouken Part 5: Ougon no Kaze",
      season: 1,
      part: 1,
    });
  });

  it("builds a series context with deduplicated title variants", () => {
    const ctx = buildSearchContext(
      anime("Sousou no Frieren 2nd Season", "Frieren: Beyond Journey's End Season 2"),
      "series",
      5,
    );
    assert.deepEqual(ctx.titles, ["Sousou no Frieren", "Frieren Beyond Journey's End"]);
    assert.equal(ctx.expectedSeason, 2);
    assert.equal(ctx.episode, 5);
    assert.equal(titleWithEpisode(ctx.titles[0]!, ctx, ctx.episode), "Sousou no Frieren 05");
    assert.equal(ctx.absoluteEpisode, undefined);
    assert.deepEqual(searchEpisodes(ctx), [5]);
  });

  it("adds the absolute episode when earlier cours exist", () => {
    const root = anime("BLEACH: Sennen Kessen-hen", "BLEACH: Thousand-Year Blood War", "TV", 13, "43078");
    const ctx = buildSearchContext(anime("BLEACH: Sennen Kessen-hen - Kashin-tan"), "series", 1, { offset: 40, root });
    assert.deepEqual(ctx.titles, ["BLEACH Sennen Kessen-hen Kashin-tan"]);
    assert.equal(ctx.absoluteEpisode, 41);
    assert.deepEqual(ctx.franchiseTitles, ["BLEACH Sennen Kessen-hen", "BLEACH Thousand-Year Blood War"]);
    assert.deepEqual(searchEpisodes(ctx), [1, 41]);
    assert.equal(titleWithEpisode(ctx.titles[0]!, ctx, 41), "BLEACH Sennen Kessen-hen Kashin-tan 41");
  });

  it("builds a movie context without an episode", () => {
    const ctx = buildSearchContext(anime("Kimi no Na wa.", "Your Name.", "movie"), "movie", undefined);
    assert.equal(ctx.type, "movie");
    assert.equal(ctx.episode, undefined);
    assert.equal(titleWithEpisode(ctx.titles[0]!, ctx, undefined), "Kimi no Na wa");
    assert.deepEqual(searchEpisodes(ctx), [undefined]);
  });
});

describe("locateEpisode", () => {
  // Kitsu's four Bleach: Thousand-Year Blood War cours.
  const cours = [
    anime("BLEACH: Sennen Kessen-hen", undefined, "TV", 13, "43078"),
    anime("BLEACH: Sennen Kessen-hen - Ketsubetsu-tan", undefined, "TV", 13, "46903"),
    anime("BLEACH: Sennen Kessen-hen - Soukoku-tan", undefined, "TV", 14, "48015"),
    anime("BLEACH: Sennen Kessen-hen - Kashin-tan", undefined, "TV", 10, "49444"),
  ];

  it("maps an absolute episode onto the right cour", () => {
    const at = (n: number) => {
      const found = locateEpisode(cours, n);
      return found && [found.anime.id, found.episode];
    };
    assert.deepEqual(at(1), ["43078", 1]);
    assert.deepEqual(at(13), ["43078", 13]);
    assert.deepEqual(at(14), ["46903", 1]);
    assert.deepEqual(at(41), ["49444", 1]); // Cinemeta S4E1
    assert.deepEqual(at(50), ["49444", 10]);
  });

  it("lets a still-airing entry (no episode count) absorb the rest", () => {
    const airing = [anime("Show", undefined, "TV", 12, "a"), anime("Show 2nd Season", undefined, "TV", undefined, "b")];
    assert.deepEqual(locateEpisode(airing, 15)?.anime.id, "b");
    assert.equal(locateEpisode(airing, 15)?.episode, 3);
  });
});

describe("parseTokyoToshoRss", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>t</title>
<item>
<category>Anime</category>
<title>[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5].mkv</title>
<link><![CDATA[https://nyaa.si/download/1.torrent]]></link>
<description><![CDATA[<a href="https://nyaa.si/download/1.torrent">Torrent Link</a><br />
<a href="magnet:?xt=urn:btih:2HBRFPYXC3AZ53OO374TWKVG5E3PA5GE&tr=http://nyaa.tracker.wf:7777/announce">Magnet Link</a><br />
Size: 1.4GB<br />]]></description>
<pubDate>Tue, 29 Sep 2026 13:32:54 GMT</pubDate>
</item>
<item><category>Anime</category><title>No magnet here</title><description>nothing</description></item>
</channel></rss>`;

  it("extracts title, magnet, size and category; skips items without a magnet", () => {
    const items = parseTokyoToshoRss(xml);
    assert.equal(items.length, 1);
    const [item] = items;
    assert.equal(item?.title, "[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5].mkv");
    assert.equal(
      item?.magnet,
      "magnet:?xt=urn:btih:2HBRFPYXC3AZ53OO374TWKVG5E3PA5GE&tr=http://nyaa.tracker.wf:7777/announce",
    );
    assert.equal(item?.size, "1.4GB");
    assert.equal(item?.category, "Anime");
  });

  it("handles a single <item> and an empty feed", () => {
    assert.equal(parseTokyoToshoRss(xml.replace(/<item><category>Anime<\/category><title>No magnet.*?<\/item>/s, "")).length, 1);
    assert.deepEqual(parseTokyoToshoRss("<rss><channel></channel></rss>"), []);
  });
});
