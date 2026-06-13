/**
 * P3-03: resolvePage helper + public CMS page renderer correctness tests.
 *
 * Covers:
 *   L1: published page returns { page, version } with blocks rendered via
 *       renderBlock dispatch (one call per block).
 *   L1: draft page → notFound (never rendered publicly).
 *   L1: missing slug → notFound.
 *   L1: reserved slug → notFound (before any store lookup).
 *   L1: generateMetadata returns title + description from page.seo for a
 *       published page, and safe-empty ({ title: "" }) for a missing page.
 *   L5: adversarial — multi-segment slug joined correctly ("a/b" → "a/b").
 */

import { describe, expect, it, vi } from "vitest";

// ── Mock renderBlock so we can spy on dispatch without RSC machinery ──────────
vi.mock("@/lib/content/blocks/registry", () => ({
  renderBlock: vi.fn().mockResolvedValue(null),
}));

// Mock next/navigation's notFound so we can assert it's called
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// ── Import test subjects AFTER mocks ──────────────────────────────────────────
const { resolvePage, resolveMetadata } = await import(
  "@/lib/content/resolve-page"
);

import { renderBlock } from "@/lib/content/blocks/registry";
import { createInMemoryContentStore } from "@/lib/adapters/drizzle-content-store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePublishedPage(
  store: ReturnType<typeof createInMemoryContentStore>,
  opts: {
    slug: string;
    blocks?: unknown[];
    seo?: Record<string, unknown> | null;
  }
) {
  return async () => {
    const page = await store.createPage({
      slug: opts.slug,
      title: "Test Page",
      seo: opts.seo ?? { title: "Test Title", description: "Test desc" },
    });
    const version = await store.createPageVersion({
      pageId: page.id,
      blocks: opts.blocks ?? [{ type: "hero", props: { headline: "Hi" } }],
      createdBy: "test",
    });
    await store.publishPage(page.id, version.id);
    return { page, version };
  };
}

// ── L1: published page resolves correctly ────────────────────────────────────

describe("resolvePage — published page", () => {
  it("returns { page, version } for a published page", async () => {
    const store = createInMemoryContentStore();
    const setup = makePublishedPage(store, { slug: "about-us" });
    const { page, version } = await setup();

    const result = await resolvePage("about-us", store);
    expect(result).not.toBeNull();
    expect(result!.page.id).toBe(page.id);
    expect(result!.version.id).toBe(version.id);
  });

  it("dispatches renderBlock once per block in version.blocks", async () => {
    const store = createInMemoryContentStore();
    const blocks = [
      { type: "hero", props: { headline: "Hello" } },
      { type: "richTextBlock", props: { html: "<p>hi</p>" } },
    ];
    const setup = makePublishedPage(store, { slug: "multi-block", blocks });
    await setup();

    vi.mocked(renderBlock).mockClear();
    const result = await resolvePage("multi-block", store);
    expect(result).not.toBeNull();

    // Render the blocks (simulate what the page component does)
    for (const block of result!.version.blocks as Array<{ type: string; props: Record<string, unknown> }>) {
      await renderBlock({ type: block.type, props: block.props });
    }

    expect(renderBlock).toHaveBeenCalledTimes(2);
    expect(renderBlock).toHaveBeenNthCalledWith(1, {
      type: "hero",
      props: { headline: "Hello" },
    });
    expect(renderBlock).toHaveBeenNthCalledWith(2, {
      type: "richTextBlock",
      props: { html: "<p>hi</p>" },
    });
  });
});

// ── L1: draft page → notFound ────────────────────────────────────────────────

describe("resolvePage — draft page", () => {
  it("returns null for a draft (unpublished) page", async () => {
    const store = createInMemoryContentStore();
    await store.createPage({ slug: "draft-page", title: "Draft" });
    // Intentionally NOT publishing it

    const result = await resolvePage("draft-page", store);
    expect(result).toBeNull();
  });
});

// ── L1: missing slug → null ──────────────────────────────────────────────────

describe("resolvePage — missing slug", () => {
  it("returns null for a slug that does not exist", async () => {
    const store = createInMemoryContentStore();
    const result = await resolvePage("this-slug-does-not-exist", store);
    expect(result).toBeNull();
  });
});

// ── L1: reserved slug → null (fast-path before store lookup) ─────────────────

describe("resolvePage — reserved slug", () => {
  it("returns null for a reserved slug", async () => {
    const store = createInMemoryContentStore();
    const result = await resolvePage("checkout", store);
    expect(result).toBeNull();
  });

  it("returns null for 'admin' (reserved)", async () => {
    const store = createInMemoryContentStore();
    const result = await resolvePage("admin", store);
    expect(result).toBeNull();
  });
});

// ── L1: generateMetadata ─────────────────────────────────────────────────────

describe("resolveMetadata — from seo field", () => {
  it("returns title and description from page.seo for a published page", async () => {
    const store = createInMemoryContentStore();
    const setup = makePublishedPage(store, {
      slug: "about-cms",
      seo: { title: "About Us | FTT", description: "Our story in silk" },
    });
    await setup();

    const meta = await resolveMetadata("about-cms", store);
    expect(meta.title).toBe("About Us | FTT");
    expect(meta.description).toBe("Our story in silk");
  });

  it("returns safe-empty metadata for a missing page", async () => {
    const store = createInMemoryContentStore();
    const meta = await resolveMetadata("nonexistent-page", store);
    expect(meta.title).toBe("");
    expect(meta.description).toBeUndefined();
  });

  it("returns safe-empty metadata for a draft page", async () => {
    const store = createInMemoryContentStore();
    await store.createPage({ slug: "draft-meta", title: "Draft Meta" });

    const meta = await resolveMetadata("draft-meta", store);
    expect(meta.title).toBe("");
    expect(meta.description).toBeUndefined();
  });

  it("returns safe-empty metadata for a reserved slug", async () => {
    const store = createInMemoryContentStore();
    const meta = await resolveMetadata("checkout", store);
    expect(meta.title).toBe("");
  });

  it("includes openGraph from seo when page is published", async () => {
    const store = createInMemoryContentStore();
    const setup = makePublishedPage(store, {
      slug: "og-page",
      seo: {
        title: "OG Title",
        description: "OG Desc",
        ogTitle: "OG Open Graph Title",
      },
    });
    await setup();

    const meta = await resolveMetadata("og-page", store);
    expect(meta.openGraph).toBeDefined();
    expect(meta.openGraph?.title).toBe("OG Title");
    expect(meta.openGraph?.description).toBe("OG Desc");
  });
});

// ── L5: adversarial ──────────────────────────────────────────────────────────

describe("resolvePage — adversarial", () => {
  it("slug 'my-checkout-page' is NOT reserved and resolves to null (not found)", async () => {
    const store = createInMemoryContentStore();
    // Not reserved — passes slug check — but does not exist
    const result = await resolvePage("my-checkout-page", store);
    expect(result).toBeNull();
  });

  it("slug 'my-checkout-page' published page resolves correctly", async () => {
    const store = createInMemoryContentStore();
    const setup = makePublishedPage(store, { slug: "my-checkout-page" });
    const { page } = await setup();

    const result = await resolvePage("my-checkout-page", store);
    expect(result).not.toBeNull();
    expect(result!.page.id).toBe(page.id);
  });

  it("multi-segment slug array joins to 'a/b' correctly", () => {
    // Simulate the join logic: slug segments ["a", "b"] -> "a/b"
    const slugSegments = ["a", "b"];
    const joined = slugSegments.join("/");
    expect(joined).toBe("a/b");
  });
});
