/**
 * P3-09: Redirects CRUD route tests.
 *
 * Mutation-proven: creating a redirect means getRedirect returns it.
 * Duplicate from_path is rejected.
 * Admin guard enforced on write endpoints.
 */

import { describe, expect, it } from "vitest";

import { createRouteHarness } from "../helpers/route-harness";
import { registerRedirectsRoutes } from "@/api/hono/routes/redirects";
import { createInMemoryContentStore } from "@/lib/adapters/drizzle-content-store";

function makeHarness() {
  const store = createInMemoryContentStore();
  return {
    harness: createRouteHarness({
      register: (app) => registerRedirectsRoutes(app, store),
      authUser: { id: "admin-1", email: "admin@example.com", role: "admin" },
    }),
    store,
  };
}

// ── POST / — create redirect ──────────────────────────────────────────────────

describe("POST / — create redirect (mutation-proven)", () => {
  it("creates a redirect and the store reflects it", async () => {
    const { harness, store } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/old-url", toPath: "/new-url" }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.fromPath).toBe("/old-url");
    expect(data.toPath).toBe("/new-url");

    // Mutation: the store now has the redirect
    const stored = await store.getRedirect("/old-url");
    expect(stored).not.toBeNull();
    expect(stored!.toPath).toBe("/new-url");
  });

  it("rejects duplicate from_path with 409", async () => {
    const { harness } = makeHarness();

    await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/dup", toPath: "/dest-1" }),
    });

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/dup", toPath: "/dest-2" }),
    });

    expect(res.status).toBe(409);
  });

  it("validates fromPath must start with /", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "no-leading-slash", toPath: "/dest" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects empty body fields", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "", toPath: "/dest" }),
    });

    expect(res.status).toBe(400);
  });
});

// ── GET / — list redirects ────────────────────────────────────────────────────

describe("GET / — list redirects", () => {
  it("returns empty array when no redirects exist", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/");
    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it("lists all created redirects", async () => {
    const { harness } = makeHarness();

    await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/r1", toPath: "/d1" }),
    });
    await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/r2", toPath: "/d2" }),
    });

    const res = await harness.request("/");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ fromPath: string; toPath: string }>;
    expect(data.length).toBe(2);
    expect(data.map((d) => d.fromPath).sort()).toEqual(["/r1", "/r2"]);
  });
});

// ── Money-path deny-list ──────────────────────────────────────────────────────

describe("Money-path deny-list on POST /", () => {
  it("rejects /checkout as fromPath with 400", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/checkout", toPath: "/elsewhere" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { code?: string };
    expect(data.code).toBe("BLOCKED_FROM_PATH");
  });

  it("rejects /checkout/confirmation as fromPath with 400", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/checkout/confirmation", toPath: "/thanks" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { code?: string };
    expect(data.code).toBe("BLOCKED_FROM_PATH");
  });

  it("rejects /cart as fromPath with 400", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/cart", toPath: "/checkout" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { code?: string };
    expect(data.code).toBe("BLOCKED_FROM_PATH");
  });

  it("allows non-money-path fromPath like /old-blog", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/old-blog", toPath: "/blog" }),
    });

    expect(res.status).toBe(201);
  });
});

// ── toPath validation (security: open-redirect surface) ──────────────────────

describe("toPath validation on POST /", () => {
  it("rejects javascript:alert(1) as toPath with 400", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/old", toPath: "javascript:alert(1)" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects protocol-relative //evil.com as toPath with 400", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/old2", toPath: "//evil.com" }),
    });

    expect(res.status).toBe(400);
  });

  it("accepts a valid relative toPath starting with /", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/old3", toPath: "/new-path" }),
    });

    expect(res.status).toBe(201);
  });

  it("accepts a valid absolute https:// toPath", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/old4", toPath: "https://example.com/page" }),
    });

    expect(res.status).toBe(201);
  });

  it("rejects data: URI as toPath with 400", async () => {
    const { harness } = makeHarness();

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/old5", toPath: "data:text/html,<h1>XSS</h1>" }),
    });

    expect(res.status).toBe(400);
  });
});

// ── Admin guard ───────────────────────────────────────────────────────────────

describe("Admin guard on redirects", () => {
  it("POST returns 401 for unauthenticated user", async () => {
    const store = createInMemoryContentStore();
    const harness = createRouteHarness({
      register: (app) => registerRedirectsRoutes(app, store),
      authUser: null,
    });

    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: "/from", toPath: "/to" }),
    });
    expect(res.status).toBe(401);
  });
});
