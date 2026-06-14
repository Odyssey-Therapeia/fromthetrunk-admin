/**
 * P6-07: Sentry-compatible error-tracker adapter.
 *
 * Env-gated: only active when SENTRY_DSN is set.
 * When SENTRY_DSN is absent → returns null (caller uses no-op).
 *
 * NOTE: No @sentry SDK is installed. This adapter is a thin shim that can be
 * wired to a Sentry SDK when one is added. For now it just logs to stdout so
 * the port is real and testable without an external dependency.
 * Swap the body of capture() for `Sentry.captureException(error, { extra: context })`
 * once @sentry/nextjs is added to package.json.
 *
 * Mirrors the env-gating pattern from lib/adapters/ga4-sink.ts (P2-07).
 */
import type { ErrorTracker } from "@/lib/ports/error-tracker";

/**
 * Returns the error-tracker adapter when SENTRY_DSN is configured,
 * or null if the adapter is not configured.
 */
export function buildSentryAdapter(): ErrorTracker | null {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    return null;
  }

  return {
    capture(error: unknown, context?: Record<string, unknown>): void {
      // Stub implementation — replace with Sentry SDK call when @sentry/nextjs is added:
      //   Sentry.withScope((scope) => {
      //     if (context) scope.setExtras(context);
      //     Sentry.captureException(error);
      //   });
      //
      // For now: forward to the adapter so the port is testable and real.
      // The DSN being set is the gate; the actual capture is handled here.
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(
        JSON.stringify({
          level: "error",
          tracker: "sentry",
          msg: message,
          ...context,
          time: new Date().toISOString(),
        }) + "\n"
      );
    },
  };
}
