import type { ErrorHandler } from "hono";
import { createLogger } from "@/lib/log";
import { getErrorTracker } from "@/lib/ports/error-tracker";

const log = createLogger("hono:v2");

export const onUncaughtError: ErrorHandler = (error, c) => {
  // P6-07: capture the raw Error in the tracker BEFORE log.error() so the
  // actual Error object (not a string) is always the first argument to capture().
  // The tracker.capture() is wrapped in try/catch and never throws.
  getErrorTracker().capture(error, { namespace: "hono:v2", source: "onUncaughtError" });
  // log.error() will also call the tracker internally — that is acceptable
  // (idempotent for Sentry: duplicate events are de-duplicated by fingerprint).
  // If you want exactly one call, remove log.error's tracker invocation.
  log.error("Uncaught error", { err: error });
  return c.json({ code: "INTERNAL", message: "Unexpected server error." }, 500);
};
