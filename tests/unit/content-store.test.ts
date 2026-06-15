/**
 * P3-01: Content-store port + drizzle adapter tests.
 *
 * Covers:
 *   L1: createPage → createPageVersion → publishPage sets published_version_id.
 *   L2: getPublishedPage returns page+version; draft page NOT returned.
 *   L3: theme_settings singleton upsert (create then update).
 *   L4: redirects unique-slug behaviour.
 *   L5: Adversarial — reserved slug rejected by createPage.
 */

import { describe, expect, it } from "vitest";

import {
  createInMemoryContentStore,
} from "@/lib/adapters/drizzle-content-store";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return createInMemoryContentStore();
}

// ── L1 + L2: Page lifecycle ──────────────────────────────────────────────────

describe("content-store — page lifecycle", () => {
  it("creates a page in draft status", async () => {
    const store = makeStore();
    const page = await store.createPage({
      slug: "about-us",
      title: "About Us",
      seo: { title: "About Us | FTT", description: "Our story" },
    });

    expect(page.slug).toBe("about-us");
    expect(page.title).toBe("About Us");
    expect(page.status).toBe("draft");
    expect(page.publishedVersionId).toBeNull();
  });

  it("creates a page version linked to the page", async () => {
    const store = makeStore();
    const page = await store.createPage({ slug: "test-page", title: "Test" });
    const version = await store.createPageVersion({
      pageId: page.id,
      blocks: [{ type: "text", content: "Hello" }],
      createdBy: "user-abc",
    });

    expect(version.pageId).toBe(page.id);
    expect(version.blocks).toEqual([{ type: "text", content: "Hello" }]);
    expect(version.createdBy).toBe("user-abc");
  });

  it("publishPage sets published_version_id and status=published", async () => {
    const store = makeStore();
    const page = await store.createPage({ slug: "landing", title: "Landing" });
    const version = await store.createPageVersion({
      pageId: page.id,
      blocks: [],
      createdBy: "admin",
    });

    const published = await store.publishPage(page.id, version.id);

    expect(published.status).toBe("published");
    expect(published.publishedVersionId).toBe(version.id);
  });

  it("getPublishedPage returns page+version for a published page", async () => {
    const store = makeStore();
    const page = await store.createPage({ slug: "featured", title: "Featured" });
    const version = await store.createPageVersion({
      pageId: page.id,
      blocks: [{ type: "hero", text: "Welcome" }],
      createdBy: "admin",
    });
    await store.publishPage(page.id, version.id);

    const result = await store.getPublishedPage("featured");

    expect(result).not.toBeNull();
    expect(result!.page.slug).toBe("featured");
    expect(result!.version.id).toBe(version.id);
    expect(result!.version.blocks).toEqual([{ type: "hero", text: "Welcome" }]);
  });

  it("getPublishedPage returns null for a draft page", async () => {
    const store = makeStore();
    await store.createPage({ slug: "draft-page", title: "Draft" });

    const result = await store.getPublishedPage("draft-page");

    expect(result).toBeNull();
  });

  it("getPublishedPage returns null for unknown slug", async () => {
    const store = makeStore();

    const result = await store.getPublishedPage("does-not-exist");

    expect(result).toBeNull();
  });

  it("getPageBySlug returns any page (draft or published)", async () => {
    const store = makeStore();
    const page = await store.createPage({ slug: "any-status", title: "Any" });

    const found = await store.getPageBySlug("any-status");

    expect(found).not.toBeNull();
    expect(found!.id).toBe(page.id);
    expect(found!.status).toBe("draft");
  });

  it("listPages returns all pages", async () => {
    const store = makeStore();
    await store.createPage({ slug: "page-alpha", title: "Alpha" });
    await store.createPage({ slug: "page-beta", title: "Beta" });

    const pages = await store.listPages();

    expect(pages.length).toBeGreaterThanOrEqual(2);
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("page-alpha");
    expect(slugs).toContain("page-beta");
  });
});

// ── L3: theme_settings singleton ─────────────────────────────────────────────

describe("content-store — theme_settings singleton", () => {
  it("getThemeSettings returns null when not set", async () => {
    const store = makeStore();

    const settings = await store.getThemeSettings();

    expect(settings).toBeNull();
  });

  it("saveThemeSettings creates the singleton row", async () => {
    const store = makeStore();
    const tokens = { primaryColor: "#ff6b35", fontFamily: "Inter" };

    await store.saveThemeSettings(tokens);
    const settings = await store.getThemeSettings();

    expect(settings).not.toBeNull();
    expect(settings!.tokens).toEqual(tokens);
  });

  it("saveThemeSettings upserts — second call replaces tokens", async () => {
    const store = makeStore();

    await store.saveThemeSettings({ primaryColor: "#ff6b35" });
    await store.saveThemeSettings({ primaryColor: "#000000", fontFamily: "Roboto" });

    const settings = await store.getThemeSettings();

    expect(settings!.tokens).toEqual({ primaryColor: "#000000", fontFamily: "Roboto" });
  });
});

// ── Menu CRUD ────────────────────────────────────────────────────────────────

describe("content-store — navigation menus", () => {
  it("saveMenu and getMenu round-trip", async () => {
    const store = makeStore();
    const items = [{ label: "Home", href: "/" }, { label: "Shop", href: "/collection" }];

    await store.saveMenu("header", items);
    const menu = await store.getMenu("header");

    expect(menu).not.toBeNull();
    expect(menu!.slot).toBe("header");
    expect(menu!.items).toEqual(items);
  });

  it("getMenu returns null for a slot that has not been saved", async () => {
    const store = makeStore();

    const menu = await store.getMenu("footer");

    expect(menu).toBeNull();
  });

  it("saveMenu upserts — updates items when called again", async () => {
    const store = makeStore();

    await store.saveMenu("footer", [{ label: "About", href: "/about-us" }]);
    await store.saveMenu("footer", [{ label: "Contact", href: "/contact" }]);

    const menu = await store.getMenu("footer");
    expect(menu!.items).toEqual([{ label: "Contact", href: "/contact" }]);
  });
});

// ── L4: Redirects ────────────────────────────────────────────────────────────

describe("content-store — redirects", () => {
  it("createRedirect stores from_path → to_path", async () => {
    const store = makeStore();

    const redirect = await store.createRedirect("/old-page", "/new-page");

    expect(redirect.fromPath).toBe("/old-page");
    expect(redirect.toPath).toBe("/new-page");
  });

  it("getRedirect returns the destination for a known from_path", async () => {
    const store = makeStore();
    await store.createRedirect("/sale", "/collection");

    const redirect = await store.getRedirect("/sale");

    expect(redirect).not.toBeNull();
    expect(redirect!.toPath).toBe("/collection");
  });

  it("getRedirect returns null for unknown from_path", async () => {
    const store = makeStore();

    const redirect = await store.getRedirect("/unknown");

    expect(redirect).toBeNull();
  });

  it("createRedirect rejects duplicate from_path", async () => {
    const store = makeStore();
    await store.createRedirect("/dup-path", "/first");

    await expect(store.createRedirect("/dup-path", "/second")).rejects.toThrow();
  });
});

// ── L5: Adversarial — reserved slug rejection ────────────────────────────────

describe("content-store — reserved slug rejection", () => {
  it("createPage rejects 'checkout'", async () => {
    const store = makeStore();

    await expect(
      store.createPage({ slug: "checkout", title: "Checkout" })
    ).rejects.toThrow(/reserved/i);
  });

  it("createPage rejects 'admin'", async () => {
    const store = makeStore();

    await expect(
      store.createPage({ slug: "admin", title: "Admin" })
    ).rejects.toThrow(/reserved/i);
  });

  it("createPage rejects 'api'", async () => {
    const store = makeStore();

    await expect(
      store.createPage({ slug: "api", title: "API" })
    ).rejects.toThrow(/reserved/i);
  });

  it("createPage rejects 'cart'", async () => {
    const store = makeStore();

    await expect(
      store.createPage({ slug: "cart", title: "Cart" })
    ).rejects.toThrow(/reserved/i);
  });

  it("createPage rejects 'collection'", async () => {
    const store = makeStore();

    await expect(
      store.createPage({ slug: "collection", title: "Collection" })
    ).rejects.toThrow(/reserved/i);
  });

  it("createPage accepts a non-reserved slug", async () => {
    const store = makeStore();

    const page = await store.createPage({ slug: "silk-sarees", title: "Silk Sarees" });
    expect(page.slug).toBe("silk-sarees");
  });
});
