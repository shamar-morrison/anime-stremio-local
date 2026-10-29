type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVELS[env as Level] ?? LEVELS.info;
}

type Fields = Record<string, unknown>;

function formatValue(value: unknown): string {
  if (value instanceof Error) return JSON.stringify(value.message);
  if (typeof value === "string") return /[\s"=]/.test(value) ? JSON.stringify(value) : value;
  return JSON.stringify(value);
}

function write(level: Level, scope: string, msg: string, fields?: Fields): void {
  if (LEVELS[level] < threshold()) return;
  const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), `[${scope}]`, msg];
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) parts.push(`${key}=${formatValue(value)}`);
    }
  }
  const line = parts.join(" ");
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
}

/** Create a logger whose lines are tagged with `scope`. */
export function createLogger(scope: string): Logger {
  return {
    debug: (msg, fields) => write("debug", scope, msg, fields),
    info: (msg, fields) => write("info", scope, msg, fields),
    warn: (msg, fields) => write("warn", scope, msg, fields),
    error: (msg, fields) => write("error", scope, msg, fields),
  };
}
