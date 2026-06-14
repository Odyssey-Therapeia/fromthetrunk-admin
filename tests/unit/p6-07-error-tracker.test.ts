/**
 * P6-07: Error tracker port — mutation-proofs.
 *
 * Tests the REAL logger.error() and onUncaughtError() with only the LOWEST
 * dependencies mocked (the error-tracker adapter, not the logger/onError units).
 *
 * Proves:
 *   (1) ENV-GATING: no SENTRY_DSN → no-op (never throws, capture never called)
 *   (2) ENV-GATING: SENTRY_DSN set → error forwarded to adapter (capture called)
 *   (3) LOGGER WIRE: logger.error() calls the tracker (real logger, adapter mocked)
 *   (4) ONERROR WIRE: onUncaughtError() calls the tracker (real handler, adapter mocked)
 *   (5) FIRE-AND-FORGET: tracker.capture() throwing does NOT throw from logger.error()
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — hoisted before any imports
// ---------------------------------------------------------------------------

// Mock the error-tracker adapter at the boundary (not the logger/onError units)
const captureMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/adapters/sentry-error-tracker", () => ({
  buildSentryAdapter: () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return null;
    return { capture: captureMock };
  },
}));

// ---------------------------------------------------------------------------
// Import units under test AFTER mocks are registered
// ---------------------------------------------------------------------------

import { getErrorTracker, _resetTracker } from "@/lib/ports/error-tracker";
import { createLogger } from "@/lib/log";
import { onUncaughtError } from "@/lib/http/on-uncaught-error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Minimal Hono context stub for onUncaughtError tests
function makeHonoContext() {
  return {
    json: vi.fn().mockReturnValue(new Response(JSON.stringify({ code: "INTERNAL" }), { status: 500 })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("error-tracker port", () => {
  beforeEach(() => {
    _resetTracker();
    vi.unstubAllEnvs();
    captureMock.mockReset();
  });

  afterEach(() => {
    _resetTracker();
    vi.unstubAllEnvs();
  });

  // (1) ENV-GATING: no DSN → no-op, never throws
  it("returns a no-op when SENTRY_DSN is absent", () => {
    vi.stubEnv("SENTRY_DSN", "");
    const tracker = getErrorTracker();
    expect(() => tracker.capture(new Error("boom"))).not.toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });

  // (2) ENV-GATING: DSN set → error forwarded to adapter
  it("forwards error to adapter capture() when SENTRY_DSN is set", () => {
    vi.stubEnv("SENTRY_DSN", "https://fake@sentry.io/123");
    _resetTracker(); // force re-init with new DSN
    const tracker = getErrorTracker();
    const err = new Error("tracked error");
    tracker.capture(err, { namespace: "test" });
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(err, { namespace: "test" });
  });

  // (3) LOGGER WIRE: logger.error() triggers the tracker
  it("tracker.capture() is called when logger.error() is called with DSN set", () => {
    vi.stubEnv("SENTRY_DSN", "https://fake@sentry.io/123");
    _resetTracker();
    const log = createLogger("test:namespace");
    const err = new Error("logger error");
    log.error("Something broke", { err });
    // The tracker is wired inside createLogger's error path
    expect(captureMock).toHaveBeenCalledTimes(1);
    const [capturedErr] = captureMock.mock.calls[0] as [unknown, unknown];
    // The tracker receives the actual Error object from meta.err
    expect(capturedErr).toBe(err);
  });

  // (3b) LOGGER WIRE: no-op when DSN absent (capture never called)
  it("tracker.capture() is NOT called from logger.error() when DSN absent", () => {
    vi.stubEnv("SENTRY_DSN", "");
    _resetTracker();
    const log = createLogger("test:namespace");
    log.error("Something broke", { err: new Error("boom") });
    expect(captureMock).not.toHaveBeenCalled();
  });

  // (4) ONERROR WIRE: onUncaughtError calls the tracker
  // Note: capture is called twice — once directly in onUncaughtError and once
  // via log.error()'s internal tracker path. Both calls pass the real Error object.
  it("tracker.capture() is called from onUncaughtError() when DSN set", () => {
    vi.stubEnv("SENTRY_DSN", "https://fake@sentry.io/123");
    _resetTracker();
    const err = new Error("uncaught");
    const ctx = makeHonoContext();
    onUncaughtError(err, ctx as unknown as Parameters<typeof onUncaughtError>[1]);
    // At minimum one call — the direct capture in onUncaughtError
    expect(captureMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    // The FIRST call must pass the original Error as the first argument
    const [capturedErr] = captureMock.mock.calls[0] as [unknown, unknown];
    expect(capturedErr).toBe(err);
  });

  // (5) FIRE-AND-FORGET: throwing tracker does NOT throw from logger.error()
  it("a throwing tracker.capture() does not propagate from logger.error()", () => {
    vi.stubEnv("SENTRY_DSN", "https://fake@sentry.io/123");
    _resetTracker();
    captureMock.mockImplementation(() => {
      throw new Error("tracker SDK crashed");
    });
    const log = createLogger("test:namespace");
    // Must not throw
    expect(() => log.error("Something broke", { err: new Error("original") })).not.toThrow();
  });
});
