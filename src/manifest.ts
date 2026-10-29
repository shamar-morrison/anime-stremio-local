import type { Manifest } from "@stremio-addon/sdk";

export const manifest: Manifest = {
  id: "community.anime-stremio-local",
  version: "1.2.0",
  name: "Anime Local (Sub / Dub)",
  description:
    "Self-hosted anime torrent streams from Anime Garden, Nyaa, Tokyo Toshokan and nekoBT, sorted into Subbed and Dubbed. " +
    "Runs on your own machine; works from Stremio's default (Cinemeta) catalogs and the Anime Kitsu catalog.",
  resources: ["stream"],
  types: ["series", "movie"],
  // Kitsu ids (Anime Kitsu catalog) and IMDb ids (Cinemeta). Non-anime tt… titles get an empty answer.
  idPrefixes: ["kitsu", "tt"],
  catalogs: [],
  behaviorHints: {
    // BitTorrent streams: peers can see the user's IP. Stremio shows a warning for this.
    p2p: true,
  },
};
