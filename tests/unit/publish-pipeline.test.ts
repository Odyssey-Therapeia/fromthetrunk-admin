/**
 * P3-06: Publish pipeline tests — L2 route integration.
 *
 * Covers:
 *   L2-A: POST /:id/publish — flips published_version_id to the frozen draft,
 *          calls revalidateTag("page:<slug>"), emits content_published fire-and-forget.
 *   L2-B: POST /:id/unpublish — clears published_version_id,
 *          calls revalidateTag("page:<slug>").
 *   L2-C: POST /:id/versions/:versionId/restore (rollback) — sets publishedVersionId
 *          to the CHOSEN prior version (mutation-proven: not latest), calls revalidateTag.
 *   L2-D: Event emit fire-and-forget — a throwing sink MUST NOT fail publish.
 *   L2-E: Preview token generation endpoint returns a signed token.
 *
 * Guard against REJECT: every operation that changes published state MUST:
 *   1. Call revalidateTag("page:<slug>") — exact string asserted.
 *   2. Route through the content-store port (not raw DB).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoist mock setup so vi.mock factories can reference them ──────────────────
const { revalidateTagMock } = vi.hoisted(() => {
  return {
    revalidateTagMock: vi.fn(),
  };
});

// ── Mock next/cache (revalidateTag) ──────────────────────────────────────────
// Must be mocked so safeRevalidateTag doesn't throw outside Next.js runtime.
vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
  unstable_cache: vi.fn((fn: () => unknown) => fn),
}));

import { createRouteHarness } from "../helpers/route-harness";
import { registerPagesRoutes, type EmitFn } from "@/api/hono/routes/pages";
import { createInMemoryContentStore } from "@/lib/adapters/drizzle-content-store";

// ── Env setup ─────────────────────────────────────────────────────────────────
beforeEach(async () => {
  process.env.NEXTAUTH_SECRET = "test-secret-p3-06-preview-pipeline";
  // Drain the microtask queue so any fire-and-forget void promises from the
  // previous test settle before we reset mocks.
  await new Promise((r) => setTimeout(r, 0));
  revalidateTagMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Harness factory ───────────────────────────────────────────────────────────
// The emitFn is injected directly into the route factory to avoid dynamic-import
// module-cache issues when running alongside other test files.

function makeHarness(emitFn?: EmitFn) {
  const store = createInMemoryContentStore();
  return {
    store,
    harness: createRouteHarness({
      register: (app) => registerPagesRoutes(app, store, emitFn),
      authUser: { id: "admin-1", email: "admin@example.com", role: "admin" },
    }),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createPageWithVersion(
  harness: ReturnType<typeof makeHarness>["harness"],
  slug: string
) {
  const createRes = await harness.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, title: `Page ${slug}` }),
  });
  const page = (await createRes.json()) as { id: string; slug: string };

  const versionRes = await harness.request(`/${page.id}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks: [{ type: "hero", props: { headline: "Hello" } }] }),
  });
  const version = (await versionRes.json()) as { id: string };

  return { page, version };
}

// ── L2-A: Publish ─────────────────────────────────────────────────────────────

describe("POST /:id/publish — publish latest draft version", () => {
  it("returns 200 and sets publishedVersionId to the latest version", async () => {
    const { harness } = makeHarness();
    const { page, version } = await createPageWithVersion(harness, "pub-page-1");

    const res = await harness.request(`/${page.id}/publish`, { method: "POST" });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as {
      publishedVersionId: string | null;
      status: string;
    };
    expect(updated.publishedVersionId).toBe(version.id);
    expect(updated.status).toBe("published");
  });

  it("calls revalidateTag('page:<slug>') on publish — exact string asserted", async () => {
    const { harness } = makeHarness();
    const { page } = await createPageWithVersion(harness, "pub-page-revalidate");

    await harness.request(`/${page.id}/publish`, { method: "POST" });

    // The tag string is the first argument; exact match.
    expect(revalidateTagMock).toHaveBeenCalled();
    expect(revalidateTagMock.mock.calls[0][0]).toBe("page:pub-page-revalidate");
  });

  it("emits content_published analytics event fire-and-forget", async () => {
    const emitMock = vi.fn().mockResolvedValue(undefined);
    const { harness } = makeHarness(emitMock);
    const { page } = await createPageWithVersion(harness, "pub-page-emit");

    await harness.request(`/${page.id}/publish`, { method: "POST" });
    // Drain the microtask queue so fire-and-forget void promise resolves.
    await new Promise((r) => setTimeout(r, 0));

    expect(emitMock).toHaveBeenCalledTimes(1);
    const [calledPageId, calledSlug, calledVersionId] = emitMock.mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(calledPageId).toBe(page.id);
    expect(calledSlug).toBe("pub-page-emit");
    expect(typeof calledVersionId).toBe("string");
    expect(calledVersionId.length).toBeGreaterThan(0);
  });

  it("a throwing emit does NOT fail publish (fire-and-forget)", async () => {
    const throwingEmit: EmitFn = () => Promise.reject(new Error("Emit exploded"));
    const { harness } = makeHarness(throwingEmit);
    const { page } = await createPageWithVersion(harness, "pub-page-sink-fail");

    // Should still succeed even though emit throws — drain microtask queue
    const res = await harness.request(`/${page.id}/publish`, { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));
    expect(res.status).toBe(200);
  });

  it("returns 404 when page does not exist", async () => {
    const { harness } = makeHarness();
    const res = await harness.request(
      "/00000000-0000-0000-0000-000000000000/publish",
      { method: "POST" }
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when page has no versions to publish", async () => {
    const { harness } = makeHarness();
    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "empty-page", title: "Empty" }),
    });
    const page = (await createRes.json()) as { id: string };

    const res = await harness.request(`/${page.id}/publish`, { method: "POST" });
    expect(res.status).toBe(422);
  });
});

// ── L2-B: Unpublish ───────────────────────────────────────────────────────────

describe("POST /:id/unpublish — clear published_version_id", () => {
  it("returns 200 and clears publishedVersionId", async () => {
    const { harness } = makeHarness();
    const { page, version } = await createPageWithVersion(
      harness,
      "unpub-page-1"
    );
    // Publish first
    await harness.request(`/${page.id}/versions/${version.id}/restore`, {
      method: "POST",
    });

    const res = await harness.request(`/${page.id}/unpublish`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as {
      publishedVersionId: string | null;
      status: string;
    };
    expect(updated.publishedVersionId).toBeNull();
    expect(updated.status).toBe("draft");
  });

  it("calls revalidateTag('page:<slug>') on unpublish — exact string asserted", async () => {
    const { harness } = makeHarness();
    const { page, version } = await createPageWithVersion(
      harness,
      "unpub-page-revalidate"
    );
    await harness.request(`/${page.id}/versions/${version.id}/restore`, {
      method: "POST",
    });

    revalidateTagMock.mockClear();
    await harness.request(`/${page.id}/unpublish`, { method: "POST" });

    // The tag string is the first argument; exact match.
    expect(revalidateTagMock).toHaveBeenCalled();
    expect(revalidateTagMock.mock.calls[0][0]).toBe("page:unpub-page-revalidate");
  });

  it("returns 404 when page does not exist", async () => {
    const { harness } = makeHarness();
    const res = await harness.request(
      "/00000000-0000-0000-0000-000000000000/unpublish",
      { method: "POST" }
    );
    expect(res.status).toBe(404);
  });
});

// ── L2-C: Rollback (restore) — mutation-proven for chosen version ─────────────

describe("POST /:id/versions/:versionId/restore — rollback to CHOSEN version", () => {
  it("mutation-proven: restore to v1 sets publishedVersionId=v1, NOT v2 (latest)", async () => {
    const { harness } = makeHarness();
    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "rollback-page", title: "Rollback" }),
    });
    const page = (await createRes.json()) as { id: string };

    const v1Res = await harness.request(`/${page.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [{ type: "hero", props: { headline: "v1" } }] }),
    });
    const v1 = (await v1Res.json()) as { id: string };

    const v2Res = await harness.request(`/${page.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: [{ type: "hero", props: { headline: "v2" } }] }),
    });
    const v2 = (await v2Res.json()) as { id: string };

    // Restore to v1 (not v2 = latest)
    const restoreRes = await harness.request(
      `/${page.id}/versions/${v1.id}/restore`,
      { method: "POST" }
    );

    expect(restoreRes.status).toBe(200);
    const updated = (await restoreRes.json()) as {
      publishedVersionId: string | null;
    };
    expect(updated.publishedVersionId).toBe(v1.id);
    // Mutation-proven: must NOT be v2
    expect(updated.publishedVersionId).not.toBe(v2.id);
  });

  it("restore calls revalidateTag('page:<slug>') — exact string asserted", async () => {
    const { harness } = makeHarness();
    const { page, version } = await createPageWithVersion(
      harness,
      "restore-revalidate"
    );

    revalidateTagMock.mockClear();
    await harness.request(`/${page.id}/versions/${version.id}/restore`, {
      method: "POST",
    });

    // The tag string is the first argument; exact match.
    expect(revalidateTagMock).toHaveBeenCalled();
    expect(revalidateTagMock.mock.calls[0][0]).toBe("page:restore-revalidate");
  });

  it("restore emits content_published fire-and-forget via injected emit", async () => {
    const emitMock = vi.fn().mockResolvedValue(undefined);
    const { harness } = makeHarness(emitMock);
    const { page, version } = await createPageWithVersion(harness, "restore-emit");

    await harness.request(`/${page.id}/versions/${version.id}/restore`, {
      method: "POST",
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(emitMock).toHaveBeenCalledTimes(1);
    const [calledPageId, calledSlug] = emitMock.mock.calls[0] as [string, string];
    expect(calledPageId).toBe(page.id);
    expect(calledSlug).toBe("restore-emit");
  });
});

// ── L2-E: Preview token endpoint ──────────────────────────────────────────────

describe("GET /:id/preview-token — generate signed preview URL token", () => {
  it("returns 200 with a signed token and previewUrl", async () => {
    const { harness } = makeHarness();
    const { page } = await createPageWithVersion(harness, "preview-page");

    const res = await harness.request(`/${page.id}/preview-token`);

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      token: string;
      previewUrl: string;
    };
    expect(typeof data.token).toBe("string");
    expect(data.token.length).toBeGreaterThan(0);
    expect(data.previewUrl).toContain("preview-page");
    expect(data.previewUrl).toContain("__preview_token=");
  });

  it("previewUrl routes through /api/preview (not directly to the page) — LOAD-BEARING wiring", async () => {
    // PRIOR FINDINGS #2: preview URL must route through /api/preview?slug=...
    // to enable draftMode server-side before rendering the draft page.
    // If this routes straight to /<slug>, draftMode is never enabled and the
    // draft never renders (gate is isDraftModeEnabled && verifyPreviewToken).
    const { harness } = makeHarness();
    const { page } = await createPageWithVersion(harness, "preview-route-check");

    const res = await harness.request(`/${page.id}/preview-token`);
    const data = (await res.json()) as { previewUrl: string; slug: string };

    // The preview URL must go through the enable-handler, NOT straight to the page.
    expect(data.previewUrl).toContain("/api/preview");
    expect(data.previewUrl).toContain("slug=");
  });

  it("returns 404 for a non-existent page", async () => {
    const { harness } = makeHarness();
    const res = await harness.request(
      "/00000000-0000-0000-0000-000000000000/preview-token"
    );
    expect(res.status).toBe(404);
  });

  it("token is verifiable using verifyPreviewToken for the page slug", async () => {
    const { harness } = makeHarness();
    const { page } = await createPageWithVersion(harness, "preview-verify");

    const res = await harness.request(`/${page.id}/preview-token`);
    const data = (await res.json()) as { token: string; previewUrl: string };

    const { verifyPreviewToken } = await import("@/lib/content/preview-token");
    expect(verifyPreviewToken("preview-verify", data.token)).toBe(true);
  });

  it("token is NOT valid for a different slug — no-draft-leak guard", async () => {
    const { harness } = makeHarness();
    const { page } = await createPageWithVersion(harness, "preview-slug-guard");

    const res = await harness.request(`/${page.id}/preview-token`);
    const data = (await res.json()) as { token: string };

    const { verifyPreviewToken } = await import("@/lib/content/preview-token");
    // Token for preview-slug-guard must NOT work for different-slug
    expect(verifyPreviewToken("different-slug", data.token)).toBe(false);
  });
});

// ── L2-F: unpublishPage clears published state in the store ──────────────────

describe("ContentStore.unpublishPage — store-level mutation", () => {
  it("clears publishedVersionId in the in-memory store", async () => {
    const store = createInMemoryContentStore();
    const page = await store.createPage({ slug: "store-unpub", title: "Test" });
    const version = await store.createPageVersion({
      pageId: page.id,
      blocks: [],
      createdBy: "test",
    });
    await store.publishPage(page.id, version.id);

    // Verify published
    const pub = await store.getPublishedPage("store-unpub");
    expect(pub).not.toBeNull();

    // Unpublish
    const unpubbed = await store.unpublishPage(page.id);
    expect(unpubbed.publishedVersionId).toBeNull();
    expect(unpubbed.status).toBe("draft");

    // Now getPublishedPage should return null
    const afterUnpub = await store.getPublishedPage("store-unpub");
    expect(afterUnpub).toBeNull();
  });
});
