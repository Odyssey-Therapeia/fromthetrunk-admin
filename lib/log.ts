/**
 * P2-09: Structured server-side logger.
 *
 * Usage:
 *   import { createLogger } from "@/lib/log";
 *   const log = createLogger("analytics:emit");
 *   log.error("Sink failed", { err, sinkName: "ga4" });
 *
 * Output format:
 *   - production (NODE_ENV === "production"): one JSON object per line
 *     { level, namespace, msg, ...meta, time }
 *   - development/test: human-readable text with namespace prefix
 *
 * Level filtering:
 *   Set LOG_LEVEL env var to "debug" | "info" | "warn" | "error" (default: "info").
 *   "debug" shows all; "error" shows only errors.
 *
 * Safety:
 *   All methods are wrapped in try/catch — the logger NEVER throws.
 *   Safe to use inside fire-and-forget paths.
 *
 * P6-07: error() also forwards to the error-tracker port (env-gated, never throws).
 */
import { getErrorTracker } from "@/lib/ports/error-tracker";

type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }
  return value;
}

function toSafeJson(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj, (_key, value: unknown) => serializeValue(value));
  } catch {
    // Fallback for circular references or other non-serializable values
    try {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        try {
          JSON.stringify(v);
          safe[k] = v instanceof Error ? serializeValue(v) : v;
        } catch {
          safe[k] = "[unserializable]";
        }
      }
      return JSON.stringify(safe);
    } catch {
      return JSON.stringify({ _serializationError: true });
    }
  }
}

function writeJson(level: LogLevel, namespace: string, msg: string, meta?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    level,
    namespace,
    msg,
    ...meta,
    time: new Date().toISOString(),
  };
  process.stdout.write(toSafeJson(entry) + "\n");
}

function writeHuman(level: LogLevel, namespace: string, msg: string, meta?: Record<string, unknown>): void {
  const prefix = `[${level.toUpperCase()}] [${namespace}]`;
  const metaPart = meta && Object.keys(meta).length > 0
    ? ` ${JSON.stringify(meta, (_key, value: unknown) => serializeValue(value))}`
    : "";
  process.stdout.write(`${prefix} ${msg}${metaPart}\n`);
}

function log(level: LogLevel, namespace: string, msg: string, meta?: Record<string, unknown>): void {
  try {
    const minLevel = getMinLevel();
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    if (isProduction()) {
      writeJson(level, namespace, msg, meta);
    } else {
      writeHuman(level, namespace, msg, meta);
    }
  } catch {
    // Never throw — swallow any logging failure silently
  }
}

/**
 * Creates a namespaced logger instance.
 *
 * @param namespace - identifies the calling module, e.g. "analytics:emit"
 * @returns Logger with debug / info / warn / error methods
 */
export function createLogger(namespace: string): Logger {
  return {
    debug(msg: string, meta?: Record<string, unknown>): void {
      log("debug", namespace, msg, meta);
    },
    info(msg: string, meta?: Record<string, unknown>): void {
      log("info", namespace, msg, meta);
    },
    warn(msg: string, meta?: Record<string, unknown>): void {
      log("warn", namespace, msg, meta);
    },
    error(msg: string, meta?: Record<string, unknown>): void {
      log("error", namespace, msg, meta);
      // P6-07: forward to error-tracker port (env-gated, never throws).
      // Extract the first Error object from meta if present (typically meta.err).
      try {
        const tracker = getErrorTracker();
        const errValue = meta?.err instanceof Error ? meta.err : undefined;
        tracker.capture(errValue ?? new Error(msg), { namespace, msg, ...meta });
      } catch {
        // Never throw from the logging path
      }
    },
  };
}
