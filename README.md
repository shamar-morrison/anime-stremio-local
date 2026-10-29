# anime-stremio-local

A self-hosted Stremio addon that runs on your own laptop. It finds anime torrents on **Anime Garden**, **Nyaa.si**, **Tokyo Toshokan** and **nekoBT**, removes duplicates, and lists them with **Subbed** streams first and **Dubbed** streams after.

- Searches all four sources in parallel. A slow or broken source never blocks the others (15 s timeout each).
- Works from Stremio's **default catalogs** (IMDb IDs, via Cinemeta) and from the **Anime Kitsu** catalog. Every ID is mapped to a Kitsu entry, whose romaji and English titles are used for the search.
- Keeps only English releases. Chinese-subbed fansub releases, Nyaa's non-English and raw categories, and Tokyo Toshokan's non-English categories are dropped. For nekoBT, the subtitle and audio languages it reports are used directly.
- Matches the exact episode, season and cour, including releases that keep counting across cours (Bleach: Thousand-Year Blood War part 4, episode 1 is released as `- 41`). Multi-episode batches are skipped.
- Deduplicates by info hash (the copy with the most seeders wins), then sorts by seeders and then resolution.

## Requirements

- Node.js **20 or newer** (`node -v`)
- The Stremio desktop app on the same computer
- Internet access the first time it starts, to download the IMDb → Kitsu mapping list (about 7.5 MB, cached in `.cache/` and refreshed daily)

## Install

```bash
npm install
```

## Run

```bash
npm start        # normal use
npm run dev      # development: restarts automatically when files change
```

You should see:

```
INFO  [server] addon running manifest=http://127.0.0.1:7000/manifest.json
```

Other commands:

```bash
npm test         # unit tests
npm run typecheck
```

### Settings (environment variables)

| Variable            | Default | Meaning                                    |
| ------------------- | ------- | ------------------------------------------ |
| `PORT`              | `7000`  | Port to listen on (always `127.0.0.1`)     |
| `SOURCE_TIMEOUT_MS` | `15000` | Per-source search timeout                  |
| `KITSU_TIMEOUT_MS`  | `10000` | Kitsu metadata lookup timeout              |
| `LOG_LEVEL`         | `info`  | `debug`, `info`, `warn` or `error`         |

Example: `PORT=7100 LOG_LEVEL=debug npm start`

## Add it to Stremio

1. Start the addon (`npm start`) and leave the terminal open.
2. In Stremio, open **Addons**, paste this into the search box, and press Enter:

   ```
   http://127.0.0.1:7000/manifest.json
   ```

3. Click **Install**.
4. Open any anime, from Stremio's normal Discover/Search or from the optional **Anime Kitsu** catalog addon. Pick an episode, and this addon's streams appear in the list as **Subbed | 1080p | 45 seeders** and so on.

> **The server must be running before you open a title in Stremio.** Stremio cannot start it for you. If the terminal is closed, the addon simply shows no streams. Start it again with `npm start` whenever you want to watch.

Stremio only allows plain-HTTP addons on `127.0.0.1` / `localhost`. That's why the addon listens only there, and why you can't reach it from other devices.

## How the streams are organized

- **Subbed** streams come first, then **Dubbed** streams. Each block is sorted by seeders, then resolution (2160p > 1080p > 720p > 480p > unknown).
- A release counts as **Dubbed** when its title says `Dub`, `Dubbed`, `English Dub`, `Eng Dub`, `Dual Audio` or `Multi-Audio`, or when nekoBT lists an English audio track. Everything else is **Subbed**.
- `? seeders` means the source doesn't report seeder counts. Anime Garden and Tokyo Toshokan don't, while Nyaa and nekoBT do. When the same torrent is also on Nyaa, the Nyaa copy (with real seeders) is shown.
- The second line of each stream shows the file size and the source it came from.
- Stremio has no collapsible stream sections. (`behaviorHints.group` is a deprecated alias of `bingeGroup`.) Instead, each stream gets a `bingeGroup` like `anime-stremio-local|sub|1080`, so with binge-watching Stremio keeps choosing the same kind of stream for the next episode.

## How titles are matched

Stremio sends this addon an ID for the title you opened:

- **Kitsu IDs** (`kitsu:<id>:<episode>`, from the Anime Kitsu catalog) are used directly.
- **IMDb IDs** (`tt…:<season>:<episode>`, from Stremio's default catalogs) are mapped to a Kitsu entry in this order:
  1. The [Fribb/anime-lists](https://github.com/Fribb/anime-lists) mapping, when it has exactly one Kitsu entry for that season. Example: Frieren `tt22248376` season 2 → `kitsu:49240`.
  2. Otherwise, the episode's overall position in Cinemeta's episode list, walked across the Kitsu entries in airing order. Example: SPY×FAMILY S1E15 → "Part 2" episode 3.
  3. For anime missing from the mapping, a Kitsu name search. Only Japanese animation is looked up. Example: Bleach: Thousand-Year Blood War S4E1 → "Kashin-tan" episode 1.

  Non-anime titles (Stremio asks about every `tt…` title) get an empty answer straight away.
- **Continued numbering:** for later cours, the addon adds up the earlier cours' episode counts, using Kitsu's prequel links. It then searches for and accepts both numbers (e.g. `01` and `41`). Releases with the overall number often use the franchise name instead of the cour's own name (`BLEACH Thousand Year Blood War S01E41` rather than "… Kashin-tan"). The first cour's names are searched too, and they count only together with the overall episode number.

## ⚠️ P2P and privacy disclaimer

This addon returns **BitTorrent** streams (`p2p: true` in the manifest, which is why Stremio shows a P2P warning). While you watch, Stremio downloads from and **uploads to other peers**, so **your IP address is visible to everyone in the swarm**, including copyright monitors. You are responsible for what you stream and for following the laws of your country. Use a VPN if that matters to you. The addon itself only searches public indexes. It hosts nothing and needs no accounts or API keys.

## Troubleshooting

- **No streams at all.** Check that the terminal is still running. If the terminal shows no new lines when you open an episode, Stremio isn't asking the addon: check that it's installed and that you restarted the server after updating. Otherwise, the log shows how the ID was mapped (`[imdb] mapped … kitsuId=… via=…`), then one line per source, e.g. `source ok source=nyaa count=50 ms=816` or `source failed source=tokyotosho err="… timed out …"`, followed by a `done` line with counts for each filtering stage.
- **A show finds nothing even though releases exist.** The search uses Kitsu's romaji and English titles. If fansubs name the show very differently, the releases won't match. Very old episodes (e.g. One Piece episode 5 from 1999) often have no single-episode torrents left, only batches, which this addon skips. Run with `LOG_LEVEL=debug` to see each query.
- **Wrong episode or season from the default catalog.** The IMDb → Kitsu mapping is best-effort, especially for shows found by name search. The `[imdb] mapped` log line shows which Kitsu entry was chosen. Opening the show from the Anime Kitsu catalog avoids the mapping step.
- **`port 7000 is already in use`.** The addon is probably already running in another terminal. Or start it on another port (`PORT=7001 npm start`) and install `http://127.0.0.1:7001/manifest.json` instead.
- **A stream won't start.** Releases with `? seeders` or `0 seeders` may have no one sharing them. Choose one with more seeders.

## Project layout

```
src/
  index.ts              HTTP server (127.0.0.1:PORT)
  manifest.ts           Stremio manifest
  addon.ts              Stream handler: the whole pipeline
  config.ts             Env-driven settings
  types.ts              Shared types
  metadata/kitsu.ts     Stremio ID parsing + Kitsu lookup/search/prequels with 1 h cache
  metadata/imdb.ts      IMDb (Cinemeta) → Kitsu entry + episode
  metadata/animeLists.ts  Fribb IMDb → Kitsu mapping (disk-cached, daily refresh)
  metadata/cinemeta.ts  Cinemeta metadata (episode list, anime check)
  metadata/episodeOffset.ts  Continued-numbering offset from Kitsu prequels
  metadata/searchTerms.ts  Title variants, season/part detection, query building
  providers/            animegarden.ts, nyaa.ts, tokyotosho.ts, nekobt.ts, index.ts (parallel runner)
  processing/           language, relevance, normalize, episode, classify, dedupe, sort, stream
  utils/                magnet (hex/base32 info hashes), timeout, logger
test/                   node:test unit tests (run with `npm test`)
```

## Implementation notes

- **SDK.** The project uses [`@stremio-addon/sdk`](https://www.npmjs.com/package/@stremio-addon/sdk) (ESM, bundled types) plus its Node runtime [`@stremio-addon/node`](https://www.npmjs.com/package/@stremio-addon/node). The core SDK has no built-in HTTP server.
- **Why `tsx` runs the app, even in production.** `nyaa-sia@3.0.0` ships extensionless ESM imports that plain Node refuses to load (`ERR_UNSUPPORTED_DIR_IMPORT`), and `tsx` resolves them. `npm run typecheck` uses `tsc --noEmit` only.
- **Nyaa runs in RSS mode, not HTML mode.** nyaa-sia's HTML parser only reads normal (`tr.default`) rows, so it silently drops every **trusted** upload (SubsPlease, Erai-raws, …) and every remake. RSS mode returns every row, with seeders.
- **nekoBT** is queried through `/api/v1/torrents/search`, the JSON endpoint its own website uses. It's undocumented, so it may change. If it breaks, that source just logs `source failed` and the other three keep working. Its robots.txt allows search use (`Content-Signal: search=yes`).
- **Sources considered and left out (checked 2026-10-29):**
  - AnimeTosho: its feeds return "Feed disabled".
  - AniDex: down (HTTP 502).
  - AniRena: its RSS has no magnet links or info hashes.
  - SubsPlease API: everything in it is already on Nyaa.
- **Base32 info hashes.** Anime Garden and Tokyo Toshokan magnets often use 32-character base32 hashes. They are converted to the 40-character hex form that Stremio requires. Results without a recoverable hash are discarded.
- **`fileIdx` is not set.** Batches are filtered out, so every result is a single episode or movie, and Stremio then picks the largest file in the torrent. A fixed `0` would sometimes pick an NFO or sample file instead.
- **Extra trackers.** Each stream's `sources` lists the magnet's trackers plus a few public anime trackers and DHT. Anime Garden magnets often carry no trackers, and the extra ones help peers be found faster.
