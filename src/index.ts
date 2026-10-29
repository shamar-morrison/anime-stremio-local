import { getRouter } from "@stremio-addon/node";
import { addonInterface } from "./addon.js";
import { config } from "./config.js";
import { getAnimeLists } from "./metadata/animeLists.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("server");

const server = getRouter(addonInterface);

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    log.error(
      `port ${config.port} is already in use; is the addon already running? Try PORT=${config.port + 1} npm start`,
    );
  } else {
    log.error("server error", { err });
  }
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const base = `http://${config.host}:${config.port}`;
  log.info("addon running", { manifest: `${base}/manifest.json` });
  log.info("install it in Stremio by pasting the manifest URL into the addon search box");
  // Warm the IMDb → Kitsu mapping so the first Cinemeta request isn't slow.
  void getAnimeLists();
});

function shutdown(signal: string): void {
  log.info("shutting down", { signal });
  server.close(() => process.exit(0));
  // Open keep-alive sockets can hold close() open; don't hang forever.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => log.error("unhandled rejection", { err: reason }));
