/**
 * P6-07: Error-tracker port.
 *
 * Env-gated singleton — returns a no-op tracker when SENTRY_DSN is absent.
 * Mirroring the analytics-sink port + ga4-sink env-gating pattern (P2-07).
 *
 * Usage:
 *   import { getErrorTracker } from "@/lib/ports/error-tracker";
 *   getErrorTracker().capture(error, { namespace: "hono:v2" });
 *
 * Safety:
 *   capture() is always wrapped in try/catch — never throws.
 *   Safe to call from the logger's error path and from onUncaughtError.
 */
import { buildSentryAdapter } from "@/lib/adapters/sentry-error-tracker";

export interface ErrorTracker {
  capture(error: unknown, context?: Record<string, unknown>): void;
}

/** No-op implementation — used when no DSN is configured. */
const noopTracker: ErrorTracker = {
  capture(): void {
    // intentionally empty
  },
};

// Lazily initialised so tests can stub process.env before the first call.
let _tracker: ErrorTracker | null = null;

/**
 * Exposed for testing — resets the cached tracker so env-gate changes take effect.
 */
export function _resetTracker(): void {
  _tracker = null;
}

/**
 * Returns the active error tracker.
 * No DSN → no-op (never throws, never captures).
 * DSN present → forwards to the configured adapter.
 */
export function getErrorTracker(): ErrorTracker {
  if (_tracker) return _tracker;

  const adapter = buildSentryAdapter();
  if (!adapter) {
    _tracker = noopTracker;
    return _tracker;
  }

  // Wrap adapter in a try/catch so a crashing SDK never propagates.
  _tracker = {
    capture(error: unknown, context?: Record<string, unknown>): void {
      try {
        adapter.capture(error, context);
      } catch {
        // Never throw from the error tracking path
      }
    },
  };

  return _tracker;
}
