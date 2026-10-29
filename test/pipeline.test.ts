import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeByInfoHash } from "../src/processing/dedupe.js";
import { normalizeTorrent, parseResolution, parseSize } from "../src/processing/normalize.js";
import { sortTorrents } from "../src/processing/sort.js";
import { cleanTitle, toStremioStream } from "../src/processing/stream.js";
import type { NormalizedTorrent } from "../src/types.js";

const HEX = "d1c312bf1716c19eedcedff93b2aa6e936f074c4";

let counter = 0;
function torrent(overrides: Partial<NormalizedTorrent>): NormalizedTorrent {
  counter++;
  return {
    infoHash: counter.toString(16).padStart(40, "0"),
    title: `Release ${counter}`,
    magnet: "",
    sizeBytes: null,
    seeders: null,
    leechers: null,
    resolution: null,
    source: "nyaa",
    isDub: false,
    batch: false,
    trackers: [],
    ...overrides,
  };
}

describe("normalize", () => {
  it("parses sizes", () => {
    assert.equal(parseSize("1.4 GiB"), Math.round(1.4 * 1024 ** 3));
    assert.equal(parseSize("5.29GB"), Math.round(5.29 * 1024 ** 3));
    assert.equal(parseSize("700 MB"), 700 * 1024 ** 2);
    assert.equal(parseSize(875351040), 875351040);
    assert.equal(parseSize(undefined), null);
    assert.equal(parseSize("n/a"), null);
  });

  it("parses resolutions", () => {
    assert.equal(parseResolution("[SubsPlease] Show - 05 (1080p)"), 1080);
    assert.equal(parseResolution("Show - 05 (CR 1920x1080 AVC AAC MKV)"), 1080);
    assert.equal(parseResolution("Show [BD 4K UHD]"), 2160);
    assert.equal(parseResolution("Show - 05 [720P]"), 720);
    assert.equal(parseResolution("[9volt] Show - 05 [6333A2BA]"), null);
  });

  it("normalizes a base32 magnet and drops results without a hash", () => {
    const ok = normalizeTorrent({
      source: "animegarden",
      title: "[Group] Show - 05 [English Dub][1080p]",
      magnet: "magnet:?xt=urn:btih:2HBRFPYXC3AZ53OO374TWKVG5E3PA5GE",
      size: 875351040,
    });
    assert.equal(ok?.infoHash, HEX);
    assert.equal(ok?.resolution, 1080);
    assert.equal(ok?.isDub, true);
    assert.equal(ok?.seeders, null);

    assert.equal(normalizeTorrent({ source: "nyaa", title: "x", magnet: "magnet:?dn=x" }), null);
  });
});

describe("dedupeByInfoHash", () => {
  it("keeps the copy with the most seeders and merges trackers", () => {
    const tt = torrent({ infoHash: HEX, source: "tokyotosho", seeders: null, trackers: ["udp://a"] });
    const ny = torrent({ infoHash: HEX, source: "nyaa", seeders: 117, trackers: ["udp://b"] });
    const [kept, ...rest] = dedupeByInfoHash([tt, ny]);
    assert.equal(rest.length, 0);
    assert.equal(kept?.source, "nyaa");
    assert.equal(kept?.seeders, 117);
    assert.deepEqual(kept?.trackers.sort(), ["udp://a", "udp://b"]);
  });

  it("breaks seeder ties by source priority (Anime Garden > Nyaa > Tokyo Toshokan)", () => {
    const tt = torrent({ infoHash: HEX, source: "tokyotosho", seeders: 0 });
    const ag = torrent({ infoHash: HEX, source: "animegarden", seeders: 0 });
    const ny = torrent({ infoHash: HEX, source: "nyaa", seeders: 0 });
    assert.equal(dedupeByInfoHash([tt, ny, ag])[0]?.source, "animegarden");
    assert.equal(dedupeByInfoHash([tt, ny])[0]?.source, "nyaa");
  });
});

describe("sortTorrents", () => {
  it("puts every Subbed stream before every Dubbed one, each by seeders then resolution", () => {
    const dubTop = torrent({ title: "dub-top", isDub: true, seeders: 500, resolution: 1080 });
    const sub720 = torrent({ title: "sub-720", seeders: 50, resolution: 720 });
    const sub1080 = torrent({ title: "sub-1080", seeders: 50, resolution: 1080 });
    const subMany = torrent({ title: "sub-many", seeders: 100, resolution: 480 });
    const subUnknown = torrent({ title: "sub-unknown", seeders: null, resolution: 2160 });
    const dubLow = torrent({ title: "dub-low", isDub: true, seeders: 1, resolution: null });

    const order = sortTorrents([dubLow, sub720, subUnknown, dubTop, sub1080, subMany]).map((t) => t.title);
    assert.deepEqual(order, ["sub-many", "sub-1080", "sub-720", "sub-unknown", "dub-top", "dub-low"]);
  });
});

describe("toStremioStream", () => {
  it("builds a playable stream object", () => {
    const stream = toStremioStream(
      torrent({
        infoHash: HEX,
        title: "[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5].mkv",
        seeders: 45,
        resolution: 1080,
        sizeBytes: 1.4 * 1024 ** 3,
        trackers: ["udp://open.stealth.si:80/announce", "wss://tracker.example/announce"],
      }),
    );
    assert.equal(stream.name, "Subbed | 1080p | 45 seeders");
    assert.equal(stream.title, "[SubsPlease] Sousou no Frieren - 05 (1080p) [8E3F8FA5]\n1.40 GB · Nyaa");
    assert.equal(stream.infoHash, HEX);
    assert.equal(stream.fileIdx, undefined);
    assert.equal(stream.behaviorHints?.bingeGroup, "anime-stremio-local|sub|1080");
    assert.ok(stream.sources?.includes("tracker:udp://open.stealth.si:80/announce"));
    assert.ok(!stream.sources?.some((s) => s.includes("wss://")));
    assert.equal(stream.sources?.at(-1), `dht:${HEX}`);
  });

  it("labels unknown seeders and resolution", () => {
    const stream = toStremioStream(torrent({ isDub: true, source: "tokyotosho" }));
    assert.equal(stream.name, "Dubbed | ? seeders");
  });

  it("cleans scene-style titles", () => {
    assert.equal(cleanTitle("Show.Name.S01E05.DDP5.1.mkv"), "Show Name S01E05 DDP5.1");
    assert.equal(cleanTitle("[Group]_Show_-_05_[1080p].mkv"), "[Group] Show - 05 [1080p]");
  });
});
