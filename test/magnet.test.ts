import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base32ToHex, extractInfoHash, extractTrackers, normalizeInfoHash } from "../src/utils/magnet.js";

// Same torrent seen on Tokyo Toshokan (base32) and nyaa.si/view/1803996 (hex).
const BASE32 = "2HBRFPYXC3AZ53OO374TWKVG5E3PA5GE";
const HEX = "d1c312bf1716c19eedcedff93b2aa6e936f074c4";

describe("magnet utils", () => {
  it("decodes base32 info hashes to hex", () => {
    assert.equal(base32ToHex(BASE32), HEX);
    assert.equal(normalizeInfoHash(BASE32.toLowerCase()), HEX);
  });

  it("lowercases hex info hashes", () => {
    assert.equal(normalizeInfoHash(HEX.toUpperCase()), HEX);
  });

  it("rejects malformed hashes", () => {
    assert.equal(normalizeInfoHash("abc"), null);
    assert.equal(normalizeInfoHash("z".repeat(40)), null);
    assert.equal(normalizeInfoHash("1".repeat(32)), null); // '1' is not base32
    assert.equal(normalizeInfoHash(undefined), null);
  });

  it("extracts the hash from hex and base32 magnets", () => {
    assert.equal(extractInfoHash(`magnet:?xt=urn:btih:${HEX}&dn=Frieren`), HEX);
    assert.equal(extractInfoHash(`magnet:?xt=urn:btih:${BASE32}`), HEX);
    assert.equal(extractInfoHash("magnet:?dn=no-hash"), null);
    assert.equal(extractInfoHash(""), null);
  });

  it("extracts trackers, dropping unsupported schemes and duplicates", () => {
    const magnet =
      `magnet:?xt=urn:btih:${HEX}` +
      "&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce" +
      "&tr=udp://open.stealth.si:80/announce" +
      "&tr=udp://open.stealth.si:80/announce" +
      "&tr=javascript:alert(1)";
    assert.deepEqual(extractTrackers(magnet), [
      "http://nyaa.tracker.wf:7777/announce",
      "udp://open.stealth.si:80/announce",
    ]);
  });
});
