import { NeonDbError, neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Agent, fetch as undiciFetch } from "undici";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize the Drizzle client.");
}

const ipv4Agent = new Agent({ connect: { family: 4 } });
neonConfig.fetchFunction = (url: string | URL | Request, init?: RequestInit) =>
  undiciFetch(url as string, { ...init, dispatcher: ipv4Agent } as Parameters<typeof undiciFetch>[1]);

const sql = neon<false, false>(connectionString);

export const db = drizzle(sql, { schema });
export type Database = typeof db;

/** Raw Neon SQL for queries Drizzle can't express (e.g. pgvector). */
export { sql as rawSql };

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 500;
const RETRY_JITTER_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TRANSIENT_ERROR_CODES = new Set([
  "ABORT_ERR",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const TRANSIENT_ERROR_NAMES = new Set([
  "AbortError",
  "ErrorEvent",
  "SocketError",
  "TimeoutError",
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  /aborterror/i,
  /connection refused/i,
  /connection reset/i,
  /failed query/i,
  /fetch failed/i,
  /network connection lost/i,
  /socketerror/i,
  /\btimeout\b/i,
  /timed out/i,
];

const collectRelatedErrors = (error: unknown): unknown[] => {
  const queue = [error];
  const seen = new Set<object>();
  const collected: unknown[] = [];

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) continue;

    if (typeof candidate === "object") {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
    }

    collected.push(candidate);

    if (!(typeof candidate === "object" && candidate !== null)) continue;

    if ("cause" in candidate) {
      queue.push(candidate.cause);
    }

    if (candidate instanceof NeonDbError && candidate.sourceError) {
      queue.push(candidate.sourceError);
    }
  }

  return collected;
};

export const isRetryableDbError = (error: unknown): boolean => {
  return collectRelatedErrors(error).some((candidate) => {
    if (!(typeof candidate === "object" && candidate !== null)) {
      return false;
    }

    const errorLike = candidate as {
      code?: unknown;
      message?: unknown;
      name?: unknown;
    };

    const code =
      typeof errorLike.code === "string" ? errorLike.code.toUpperCase() : "";
    const name = typeof errorLike.name === "string" ? errorLike.name : "";
    const message =
      typeof errorLike.message === "string" ? errorLike.message : "";

    return (
      TRANSIENT_ERROR_CODES.has(code) ||
      TRANSIENT_ERROR_NAMES.has(name) ||
      TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
    );
  });
};

const getRetryDelayMs = () =>
  RETRY_DELAY_MS + Math.floor(Math.random() * (RETRY_JITTER_MS + 1));

/**
 * Retry a DB operation once on transient Neon HTTP failures.
 * Rarely needed with the HTTP driver, kept as a safety net.
 */
export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;

      const isRetryable = isRetryableDbError(error);

      if (!isRetryable) break;

      const delay = getRetryDelayMs();
      console.warn(
        `[db] Query failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms…`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
