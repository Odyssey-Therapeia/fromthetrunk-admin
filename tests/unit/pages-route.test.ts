/**
 * P3-04: Pages CRUD route tests.
 *
 * Uses the route harness + in-memory content-store to exercise:
 *   L1: POST /pages — valid create persists a page
 *   L2: POST /pages — RESERVED slug is rejected (409)
 *   L3: PATCH /pages/:id — update title/seo
 *   L4: GET /pages/:id/versions — list versions for a page
 *   L5: POST /pages/:id/versions/:versionId/restore — RESTORE sets published_version_id
 */

import { describe, expect, it } from "vitest";

import { createRouteHarness } from "../helpers/route-harness";
import { registerPagesRoutes } from "@/api/hono/routes/pages";
import { createInMemoryContentStore } from "@/lib/adapters/drizzle-content-store";

// Build a shared harness for all tests — inject an isolated in-memory store
// per harness so tests don't share state.

function makeHarness() {
  const store = createInMemoryContentStore();
  return createRouteHarness({
    register: (app) => registerPagesRoutes(app, store),
    authUser: { id: "admin-1", email: "admin@example.com", role: "admin" },
  });
}

// ── L1: Create (valid) ───────────────────────────────────────────────────────

describe("POST /pages — create page (valid)", () => {
  it("returns 201 and the created page", async () => {
    const harness = makeHarness();

    const response = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "contact-us",
        title: "Contact Us",
        seo: { title: "Contact | FTT", description: "Get in touch" },
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.slug).toBe("contact-us");
    expect(data.title).toBe("Contact Us");
    expect(data.status).toBe("draft");
    expect(data.publishedVersionId).toBeNull();
  });

  it("persists the seo field", async () => {
    const harness = makeHarness();

    const response = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "about-ftt",
        title: "About FTT",
        seo: { title: "About | FTT", description: "Our story" },
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;
    expect(data.seo).toMatchObject({ title: "About | FTT" });
  });
});

// ── L2: Create — RESERVED slug rejected ──────────────────────────────────────

describe("POST /pages — reserved slug rejection", () => {
  const reserved = ["checkout", "cart", "admin", "api", "account", "collection"];

  for (const slug of reserved) {
    it(`rejects reserved slug "${slug}" with 409`, async () => {
      const harness = makeHarness();

      const response = await harness.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title: "Test" }),
      });

      expect(response.status).toBe(409);
      const data = (await response.json()) as { code: string; message: string };
      expect(data.code).toBe("SLUG_RESERVED");
      expect(data.message).toMatch(/reserved/i);
    });
  }
});

// ── L3: Update page ──────────────────────────────────────────────────────────

describe("PATCH /pages/:id — update page", () => {
  it("updates title and seo, returns the updated page", async () => {
    const harness = makeHarness();

    // Create first
    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "updatable-page", title: "Original Title" }),
    });
    const created = (await createRes.json()) as { id: string };

    // Update
    const updateRes = await harness.request(`/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Updated Title",
        seo: { title: "Updated | FTT" },
      }),
    });

    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as Record<string, unknown>;
    expect(updated.title).toBe("Updated Title");
    expect(updated.seo).toMatchObject({ title: "Updated | FTT" });
    expect(updated.slug).toBe("updatable-page"); // slug unchanged
  });

  it("returns 404 for a non-existent page id", async () => {
    const harness = makeHarness();

    const response = await harness.request(`/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });

    expect(response.status).toBe(404);
  });
});

// ── L4: List versions ────────────────────────────────────────────────────────

describe("GET /pages/:id/versions — list versions", () => {
  it("returns an empty array when no versions exist", async () => {
    const harness = makeHarness();

    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "no-versions-page", title: "No Versions" }),
    });
    const created = (await createRes.json()) as { id: string };

    const res = await harness.request(`/${created.id}/versions`);

    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("returns all versions for the page", async () => {
    const harness = makeHarness();

    // Create page
    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "versioned-page", title: "Versioned" }),
    });
    const created = (await createRes.json()) as { id: string };

    // Create 2 versions
    await harness.request(`/${created.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [{ type: "text", content: "v1" }] }),
    });
    await harness.request(`/${created.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [{ type: "text", content: "v2" }] }),
    });

    const res = await harness.request(`/${created.id}/versions`);
    const data = (await res.json()) as unknown[];
    expect(data.length).toBe(2);
  });
});

// ── L5: Restore (publish to a version) ──────────────────────────────────────

describe("POST /pages/:id/versions/:versionId/restore — restore/publish", () => {
  it("sets published_version_id to the chosen version", async () => {
    const harness = makeHarness();

    // Create page
    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "restorable-page", title: "Restorable" }),
    });
    const created = (await createRes.json()) as { id: string };

    // Create version 1
    const v1Res = await harness.request(`/${created.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [{ type: "text", content: "v1 content" }] }),
    });
    const v1 = (await v1Res.json()) as { id: string };

    // Create version 2
    const v2Res = await harness.request(`/${created.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [{ type: "text", content: "v2 content" }] }),
    });
    const v2 = (await v2Res.json()) as { id: string };

    // Restore to v1 (not the latest)
    const restoreRes = await harness.request(
      `/${created.id}/versions/${v1.id}/restore`,
      { method: "POST" }
    );

    expect(restoreRes.status).toBe(200);
    const page = (await restoreRes.json()) as {
      id: string;
      publishedVersionId: string | null;
      status: string;
    };
    expect(page.publishedVersionId).toBe(v1.id);
    expect(page.status).toBe("published");

    // Confirm v2 is ignored — published points to v1
    expect(page.publishedVersionId).not.toBe(v2.id);
  });

  it("published version can be changed to a different prior version", async () => {
    const harness = makeHarness();

    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "restore-switch", title: "Switch" }),
    });
    const created = (await createRes.json()) as { id: string };

    const v1Res = await harness.request(`/${created.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [] }),
    });
    const v1 = (await v1Res.json()) as { id: string };

    const v2Res = await harness.request(`/${created.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [] }),
    });
    const v2 = (await v2Res.json()) as { id: string };

    // Publish v2 first
    await harness.request(`/${created.id}/versions/${v2.id}/restore`, {
      method: "POST",
    });

    // Then restore to v1
    const restoreRes = await harness.request(
      `/${created.id}/versions/${v1.id}/restore`,
      { method: "POST" }
    );

    const page = (await restoreRes.json()) as { publishedVersionId: string | null };
    expect(page.publishedVersionId).toBe(v1.id);
  });
});

// ── Auth guard ───────────────────────────────────────────────────────────────

describe("Auth guard — unauthenticated requests are rejected", () => {
  it("POST /pages returns 401 without auth", async () => {
    const store = createInMemoryContentStore();
    const harness = createRouteHarness({
      register: (app) => registerPagesRoutes(app, store),
      authUser: null,
    });

    const response = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "no-auth", title: "Nope" }),
    });

    expect(response.status).toBe(401);
  });
});
