/**
 * P6-07: Weekly ops digest cron — mutation-proofs.
 *
 * Tests the REAL cron handler. Mocks only the lowest-boundary dependencies:
 *   - @/db/queries/control-centre (getChannelMetrics + getEventCounts)
 *   - @/lib/email/send (sendEmail)
 *   - @/lib/email/recipients (getOrderNotificationRecipients)
 *
 * The REAL composeDashboard() is exercised (not mocked) — mutation-proof via
 * the data flowing from getChannelMetrics/getEventCounts through to the email.
 *
 * Proves:
 *   (1) 401 without CRON_SECRET
 *   (2) 200 on success — calls getChannelMetrics, getEventCounts, sendEmail
 *   (3) REAL compose: data from getChannelMetrics flows into email html
 *   (4) FIRE-AND-FORGET: sendEmail throwing → cron still returns 200
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { HonoBindings } from "@/api/hono/types";

// ---------------------------------------------------------------------------
// Hoisted mocks (boundary deps only — NOT composeDashboard)
// ---------------------------------------------------------------------------

const getChannelMetricsMock = vi.hoisted(() => vi.fn());
const getEventCountsMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const getOrderNotificationRecipientsMock = vi.hoisted(() => vi.fn());

// Mock @/db so cron.ts imports don't trigger the DATABASE_URL guard
const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/db", () => ({ db: dbMock }));

vi.mock("@/db/queries/control-centre", () => ({
  getChannelMetrics: getChannelMetricsMock,
  getEventCounts: getEventCountsMock,
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/email/recipients", () => ({
  getOrderNotificationRecipients: getOrderNotificationRecipientsMock,
}));

// We must still mock verifyBearerSecret for the secret check tests to be clean
vi.mock("@/lib/http/verify-secret", () => ({
  verifyBearerSecret: vi
    .fn()
    .mockImplementation((header: string | null, secret: string) => {
      return header === `Bearer ${secret}`;
    }),
}));

// ---------------------------------------------------------------------------
// Import units under test AFTER mocks
// ---------------------------------------------------------------------------

import { registerCronRoutes } from "@/api/hono/routes/cron";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCronApp() {
  const app = new OpenAPIHono<HonoBindings>();
  registerCronRoutes(app);
  return app;
}

const VALID_SECRET = "test-cron-secret";

const DEFAULT_CHANNEL_METRICS = {
  ga4: {
    sessions: 42,
    conversions: 5,
    totalRevenuePaise: 1000000,
    conversionRate: 0.12,
  },
  searchConsole: { indexedPageCount: 10, topQueries: [], avgCtr: 0.05 },
  vercelInsights: {
    cwv: { lcp: 2.1, inp: 100, cls: 0.05 },
    recentDeployCount: 3,
  },
  metaMarketing: {
    catalogItemCount: 20,
    catalogDisapprovals: 1,
    pixelEventCount: 100,
    capiEventCount: 90,
    parityDelta: 10,
  },
};

const DEFAULT_EVENT_COUNTS = {
  orderCreated: 7,
  paymentCompleted: 5,
  reservationExpired: 2,
  reservationsCreated: 8,
  wishlistAdded: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /weekly-ops-digest cron", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", VALID_SECRET);

    getChannelMetricsMock.mockResolvedValue(DEFAULT_CHANNEL_METRICS);
    getEventCountsMock.mockResolvedValue(DEFAULT_EVENT_COUNTS);
    sendEmailMock.mockResolvedValue(true);
    getOrderNotificationRecipientsMock.mockReturnValue([
      "ops@fromthetrunk.com",
    ]);
  });

  // (1) CRON_SECRET gate: no secret set → 500
  it("returns 500 when CRON_SECRET is not configured", async () => {
    vi.unstubAllEnvs();
    // CRON_SECRET is absent
    const app = makeCronApp();
    const req = new Request("http://localhost/weekly-ops-digest", {
      method: "GET",
      headers: { authorization: `Bearer ${VALID_SECRET}` },
    });
    const res = await app.request(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CRON_SECRET_MISSING");
  });

  // (1b) 401 without auth header
  it("returns 401 when authorization header is missing", async () => {
    const app = makeCronApp();
    const req = new Request("http://localhost/weekly-ops-digest", {
      method: "GET",
    });
    const res = await app.request(req);
    expect(res.status).toBe(401);
  });

  // (1c) 401 with wrong secret
  it("returns 401 when authorization header has wrong secret", async () => {
    const app = makeCronApp();
    const req = new Request("http://localhost/weekly-ops-digest", {
      method: "GET",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await app.request(req);
    expect(res.status).toBe(401);
  });

  // (2) 200 on success — real compose called
  it("returns 200 and calls getChannelMetrics + getEventCounts + sendEmail", async () => {
    const app = makeCronApp();
    const req = new Request("http://localhost/weekly-ops-digest", {
      method: "GET",
      headers: { authorization: `Bearer ${VALID_SECRET}` },
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);

    // Both data readers must have been called (real compose path)
    expect(getChannelMetricsMock).toHaveBeenCalledTimes(1);
    expect(getEventCountsMock).toHaveBeenCalledTimes(1);

    // Email must have been sent to the ops recipient
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArgsCall = sendEmailMock.mock.calls[0] as [
      { to: string | string[]; subject: string; html: string },
    ];
    const emailArgs = emailArgsCall[0];
    const toRecipients = Array.isArray(emailArgs?.to)
      ? emailArgs.to
      : [emailArgs?.to];
    expect(toRecipients).toContain("ops@fromthetrunk.com");
    expect(emailArgs?.subject).toContain("Weekly");
    expect(emailArgs?.html).toBeTruthy();
  });

  // (3) REAL COMPOSE mutation-proof: GA4 sessions flows into email html
  it("email html contains composed data derived from getChannelMetrics (real compose)", async () => {
    getChannelMetricsMock.mockResolvedValue({
      ...DEFAULT_CHANNEL_METRICS,
      ga4: {
        sessions: 9999,
        conversions: 5,
        totalRevenuePaise: 1000000,
        conversionRate: 0.12,
      },
    });

    const app = makeCronApp();
    const req = new Request("http://localhost/weekly-ops-digest", {
      method: "GET",
      headers: { authorization: `Bearer ${VALID_SECRET}` },
    });
    await app.request(req);

    // The REAL composeDashboard() must have flowed ga4.sessions=9999 into the email
    const emailArgsCall = sendEmailMock.mock.calls[0] as [{ html: string }];
    const emailArgs = emailArgsCall[0];
    expect(emailArgs?.html).toContain("9999");
  });

  // (4) FIRE-AND-FORGET: sendEmail throwing → cron still returns 200
  it("returns 200 even when sendEmail throws (fire-and-forget)", async () => {
    sendEmailMock.mockRejectedValue(new Error("SMTP down"));

    const app = makeCronApp();
    const req = new Request("http://localhost/weekly-ops-digest", {
      method: "GET",
      headers: { authorization: `Bearer ${VALID_SECRET}` },
    });
    const res = await app.request(req);
    // Cron must NOT fail even though email threw
    expect(res.status).toBe(200);
  });
});
