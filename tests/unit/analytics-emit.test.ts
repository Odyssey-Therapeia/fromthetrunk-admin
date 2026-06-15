/**
 * P2-07: Analytics emit fan-out tests.
 *
 * Tests the emitAnalyticsEvent fan-out helper directly.
 *
 * Verifies:
 *   L1: Fan-out calls all configured adapters.
 *   L2: Fire-and-forget — a throwing adapter does NOT propagate.
 *   L4: Env-gating — GA4 and Meta CAPI adapters activate only when env vars present.
 *   L5: event_id is stable and passed through to all sinks.
 *
 * Exactly-once (L3) is tested in analytics-emit-exactly-once.test.ts
 * because it needs to mock @/lib/analytics/emit itself.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — all vi.mock calls are hoisted to file top by vitest
// ---------------------------------------------------------------------------

const insertEventMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/db/queries/events", () => ({
  insertEvent: insertEventMock,
}));

// Stub global fetch for GA4 + Meta CAPI calls
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

// Mock the logger — capture log.error calls for L2 assertions
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock,
  }),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------

import { emitAnalyticsEvent, _resetSinks } from "@/lib/analytics/emit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeEvent = (overrides: Partial<Parameters<typeof emitAnalyticsEvent>[0]> = {}) => ({
  event_id: "evt-test-uuid-1234",
  type: "order_created" as const,
  payload: { orderId: "order-1", totalPaise: 100000 },
  occurredAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const mockOkFetch = () =>
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("emitAnalyticsEvent", () => {
  beforeEach(() => {
    _resetSinks();
    vi.unstubAllEnvs();
    insertEventMock.mockReset();
    insertEventMock.mockResolvedValue(undefined);
    fetchMock.mockReset();
    logErrorMock.mockReset();
  });

  afterEach(() => {
    _resetSinks();
  });

  describe("L1: fan-out — calls all configured adapters", () => {
    it("calls internal-events sink always (default on, no env gate)", async () => {
      const event = makeEvent();
      await emitAnalyticsEvent(event);

      expect(insertEventMock).toHaveBeenCalledTimes(1);
      expect(insertEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: event.event_id,
          type: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        })
      );
    });

    it("calls GA4 adapter when GA4_MEASUREMENT_ID + GA4_API_SECRET are set", async () => {
      vi.stubEnv("GA4_MEASUREMENT_ID", "G-TEST123");
      vi.stubEnv("GA4_API_SECRET", "test-secret");
      _resetSinks();
      mockOkFetch();

      const event = makeEvent({ type: "payment_completed" });
      await emitAnalyticsEvent(event);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("google-analytics.com/mp/collect");
      expect(url).toContain("measurement_id=G-TEST123");
      expect(url).toContain("api_secret=test-secret");

      const body = JSON.parse(init.body as string);
      expect(body.events[0].name).toBe("payment_completed");
      expect(body.events[0].params.event_id).toBe(event.event_id);
    });

    it("calls Meta CAPI adapter when META_CAPI_PIXEL_ID + META_CAPI_ACCESS_TOKEN are set", async () => {
      vi.stubEnv("META_CAPI_PIXEL_ID", "123456789");
      vi.stubEnv("META_CAPI_ACCESS_TOKEN", "EAAtest");
      _resetSinks();
      mockOkFetch();

      const event = makeEvent({ type: "payment_completed" });
      await emitAnalyticsEvent(event);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("graph.facebook.com");
      expect(url).toContain("123456789");
      expect(url).toContain("EAAtest");

      const body = JSON.parse(init.body as string);
      expect(body.data[0].event_id).toBe(event.event_id);
      // payment_completed maps to "Purchase" in Meta standard events
      expect(body.data[0].event_name).toBe("Purchase");
    });

    it("calls both GA4 and Meta CAPI when all four env vars are present", async () => {
      vi.stubEnv("GA4_MEASUREMENT_ID", "G-BOTH");
      vi.stubEnv("GA4_API_SECRET", "ga4-secret");
      vi.stubEnv("META_CAPI_PIXEL_ID", "999");
      vi.stubEnv("META_CAPI_ACCESS_TOKEN", "meta-token");
      _resetSinks();
      mockOkFetch();

      await emitAnalyticsEvent(makeEvent());

      // fetch called twice (GA4 + Meta CAPI)
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const urls = fetchMock.mock.calls.map(([u]) => u as string);
      expect(urls.some((u) => u.includes("google-analytics.com"))).toBe(true);
      expect(urls.some((u) => u.includes("graph.facebook.com"))).toBe(true);
    });
  });

  describe("L2: fire-and-forget — throwing adapters do NOT propagate", () => {
    it("resolves without throwing when internal-events sink rejects", async () => {
      insertEventMock.mockRejectedValue(new Error("DB connection failed"));

      await expect(emitAnalyticsEvent(makeEvent())).resolves.toBeUndefined();
      expect(logErrorMock).toHaveBeenCalledWith(
        "Sink failed",
        expect.objectContaining({ type: "order_created" })
      );
    });

    it("resolves without throwing when GA4 adapter returns 500", async () => {
      vi.stubEnv("GA4_MEASUREMENT_ID", "G-ERR");
      vi.stubEnv("GA4_API_SECRET", "secret");
      _resetSinks();

      fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

      await expect(emitAnalyticsEvent(makeEvent())).resolves.toBeUndefined();
      expect(logErrorMock).toHaveBeenCalledWith(
        "Sink failed",
        expect.objectContaining({ type: "order_created" })
      );
    });

    it("resolves without throwing when Meta CAPI fetch rejects (network error)", async () => {
      vi.stubEnv("META_CAPI_PIXEL_ID", "123");
      vi.stubEnv("META_CAPI_ACCESS_TOKEN", "tok");
      _resetSinks();

      fetchMock.mockRejectedValue(new Error("Network error"));

      await expect(emitAnalyticsEvent(makeEvent())).resolves.toBeUndefined();
      expect(logErrorMock).toHaveBeenCalledWith(
        "Sink failed",
        expect.objectContaining({ type: "order_created" })
      );
    });

    it("continues calling remaining sinks even when internal-events fails", async () => {
      vi.stubEnv("GA4_MEASUREMENT_ID", "G-PARTIAL");
      vi.stubEnv("GA4_API_SECRET", "secret");
      _resetSinks();

      // internal-events throws; GA4 succeeds
      insertEventMock.mockRejectedValue(new Error("DB down"));
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

      await expect(emitAnalyticsEvent(makeEvent())).resolves.toBeUndefined();

      // GA4 fetch was still called despite internal-events failure (Promise.all runs all)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(logErrorMock).toHaveBeenCalledWith(
        "Sink failed",
        expect.objectContaining({ type: "order_created" })
      );
    });
  });

  describe("L4: env-gating — GA4 and Meta CAPI only when env vars present", () => {
    it("does NOT call fetch when GA4 env vars are absent (empty strings)", async () => {
      vi.stubEnv("GA4_MEASUREMENT_ID", "");
      vi.stubEnv("GA4_API_SECRET", "");
      _resetSinks();

      await emitAnalyticsEvent(makeEvent());

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does NOT call fetch when Meta CAPI env vars are absent (empty strings)", async () => {
      vi.stubEnv("META_CAPI_PIXEL_ID", "");
      vi.stubEnv("META_CAPI_ACCESS_TOKEN", "");
      _resetSinks();

      await emitAnalyticsEvent(makeEvent());

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does NOT call fetch when neither GA4 nor Meta CAPI env vars are set", async () => {
      // Ensure neither adapter is activated
      _resetSinks();

      await emitAnalyticsEvent(makeEvent());

      expect(fetchMock).not.toHaveBeenCalled();
      expect(insertEventMock).toHaveBeenCalledTimes(1); // internal-events still fires
    });

    it("activates GA4 sink when measurement_id and api_secret are non-empty", async () => {
      vi.stubEnv("GA4_MEASUREMENT_ID", "G-REALID");
      vi.stubEnv("GA4_API_SECRET", "real-secret");
      _resetSinks();
      mockOkFetch();

      await emitAnalyticsEvent(makeEvent());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain("G-REALID");
    });
  });

  describe("L5: event_id stability — same id passed to all sinks", () => {
    it("passes the same event_id to internal-events, GA4, and Meta CAPI", async () => {
      vi.stubEnv("GA4_MEASUREMENT_ID", "G-ID");
      vi.stubEnv("GA4_API_SECRET", "sec");
      vi.stubEnv("META_CAPI_PIXEL_ID", "pid");
      vi.stubEnv("META_CAPI_ACCESS_TOKEN", "tok");
      _resetSinks();
      mockOkFetch();

      const stableId = "stable-event-id-abc123";
      await emitAnalyticsEvent(makeEvent({ event_id: stableId }));

      // internal-events receives event_id
      expect(insertEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: stableId })
      );

      // GA4 body
      const ga4Body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(ga4Body.events[0].params.event_id).toBe(stableId);

      // Meta CAPI body
      const metaBody = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(metaBody.data[0].event_id).toBe(stableId);
    });

    it("reservation_expired maps to CustomEvent in Meta CAPI", async () => {
      vi.stubEnv("META_CAPI_PIXEL_ID", "pid");
      vi.stubEnv("META_CAPI_ACCESS_TOKEN", "tok");
      _resetSinks();
      mockOkFetch();

      await emitAnalyticsEvent(makeEvent({ type: "reservation_expired" }));

      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.data[0].event_name).toBe("CustomEvent");
    });
  });
});
