import { config } from "../config.js";

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Race a promise against a timer. Used for libraries (like nyaa-sia) that do
 * not accept an AbortSignal. The underlying work is not cancelled, only ignored.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Native fetch with a hard timeout and a non-2xx check. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = config.sourceTimeoutMs,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", config.userAgent);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new TimeoutError(new URL(url).host, ms);
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${new URL(url).host}`);
  }
  return res;
}
