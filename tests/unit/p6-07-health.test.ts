/**
 * P6-07: Health route — mutation-proofs.
 *
 * Tests the REAL health route handler with only the lowest dependency mocked
 * (the db module, not the route itself).
 *
 * Proves:
 *   (1) DB OK → checkHealth() returns healthy=true
 *   (2) DB error → checkHealth() returns healthy=false
 *   (3) HTTP: DB OK → GET /health returns 200 with { status: "healthy" }
 *   (4) HTTP: DB error → GET /health returns 503 with { status: "unhealthy" }
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const dbSelectMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

// Mock the schema so we don't need a full DB setup
vi.mock("@/db/schema", () => ({
  products: { id: "id" },
}));

// ---------------------------------------------------------------------------
// Import units under test AFTER mocks are registered
// ---------------------------------------------------------------------------

import { checkHealth } from "@/lib/health/check";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { HonoBindings } from "@/api/hono/types";
import { registerHealthRoutes } from "@/api/hono/routes/health";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHealthApp() {
  const app = new OpenAPIHono<HonoBindings>();
  registerHealthRoutes(app);
  return app;
}

// ---------------------------------------------------------------------------
// Tests — checkHealth() function unit
// ---------------------------------------------------------------------------

describe("checkHealth()", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  it("returns healthy=true when DB query succeeds", async () => {
    // Simulate a successful DB select chain
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: "1" }]),
      }),
    });

    const result = await checkHealth();
    expect(result.healthy).toBe(true);
    expect(result.checks.db).toBe("ok");
  });

  it("returns healthy=false when DB query throws", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(new Error("connection refused")),
      }),
    });

    const result = await checkHealth();
    expect(result.healthy).toBe(false);
    expect(result.checks.db).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Tests — HTTP route GET /health (mutation-proof: 200 vs 503)
// ---------------------------------------------------------------------------

describe("GET /health HTTP route", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  // (3) DB OK → 200 with { status: "healthy" }
  it("returns 200 with status=healthy when DB query succeeds", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: "1" }]),
      }),
    });

    const app = makeHealthApp();
    const res = await app.request(new Request("http://localhost/", { method: "GET" }));

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; checks: { db: string } };
    expect(body.status).toBe("healthy");
    expect(body.checks.db).toBe("ok");
  });

  // (4) DB error → 503 with { status: "unhealthy" }
  it("returns 503 with status=unhealthy when DB query throws", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(new Error("neon: connection refused")),
      }),
    });

    const app = makeHealthApp();
    const res = await app.request(new Request("http://localhost/", { method: "GET" }));

    expect(res.status).toBe(503);
    const body = await res.json() as { status: string; checks: { db: string } };
    expect(body.status).toBe("unhealthy");
    expect(body.checks.db).toBe("error");
  });
});
