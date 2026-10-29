import { config } from "../config.js";
import { searchEpisodes } from "../metadata/searchTerms.js";
import type { Provider, RawTorrent, SearchContext, SourceName } from "../types.js";
import { createLogger } from "../utils/logger.js";
import { withTimeout } from "../utils/timeout.js";
import { animeGarden } from "./animegarden.js";
import { nekoBt } from "./nekobt.js";
import { nyaa } from "./nyaa.js";
import { tokyoTosho } from "./tokyotosho.js";

const log = createLogger("providers");

export const providers: readonly Provider[] = [animeGarden, nyaa, tokyoTosho, nekoBt];

export interface ProviderReport {
  source: SourceName;
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
}

/** Every query for one provider: title variants × episode numbers, plus franchise names × absolute episode. */
export function buildQueries(provider: Provider, ctx: SearchContext): string[] {
  const episodes = searchEpisodes(ctx);
  const queries = ctx.titles.flatMap((title) => episodes.map((ep) => provider.buildQuery(title, ctx, ep)));
  if (ctx.absoluteEpisode !== undefined) {
    for (const title of ctx.franchiseTitles ?? []) queries.push(provider.buildQuery(title, ctx, ctx.absoluteEpisode));
  }
  return [...new Set(queries)];
}

/** Run all of a provider's queries. It counts as failed only if every query failed. */
async function runProvider(provider: Provider, ctx: SearchContext): Promise<RawTorrent[]> {
  const queries = buildQueries(provider, ctx);
  const settled = await Promise.allSettled(
    queries.map((query) =>
      withTimeout(provider.search(query, ctx), config.sourceTimeoutMs, `${provider.name} "${query}"`),
    ),
  );

  const results: RawTorrent[] = [];
  const errors: unknown[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      log.debug("query ok", { source: provider.name, query: queries[i], count: outcome.value.length });
      results.push(...outcome.value);
    } else {
      log.debug("query failed", { source: provider.name, query: queries[i], err: outcome.reason });
      errors.push(outcome.reason);
    }
  });

  if (results.length === 0 && errors.length > 0) throw errors[0];
  return results;
}

/** Query all providers in parallel; one slow or broken source never blocks the others. */
export async function searchAllProviders(
  ctx: SearchContext,
): Promise<{ torrents: RawTorrent[]; reports: ProviderReport[] }> {
  const start = Date.now();
  const finishedAt = providers.map(() => start);
  const settled = await Promise.allSettled(
    providers.map((provider, i) =>
      runProvider(provider, ctx).finally(() => {
        finishedAt[i] = Date.now();
      }),
    ),
  );

  const torrents: RawTorrent[] = [];
  const reports = settled.map((outcome, i): ProviderReport => {
    const source = providers[i]!.name;
    const ms = finishedAt[i]! - start;
    if (outcome.status === "fulfilled") {
      torrents.push(...outcome.value);
      log.info("source ok", { source, count: outcome.value.length, ms });
      return { source, ok: true, count: outcome.value.length, ms };
    }
    const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    log.warn("source failed", { source, ms, err: error });
    return { source, ok: false, count: 0, ms, error };
  });

  return { torrents, reports };
}
