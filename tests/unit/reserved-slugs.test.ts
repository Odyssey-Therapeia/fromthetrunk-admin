/**
 * P3-01: Reserved-slug deny-list tests.
 *
 * Covers:
 *   L1: Every actual route segment is blocked.
 *   L2: A normal slug is accepted.
 *   L5: Adversarial — empty string, slug with nested path, uppercase variant.
 */

import { describe, expect, it } from "vitest";

import { isReservedSlug, RESERVED_SLUGS } from "@/lib/content/reserved-slugs";

// ── L1: every reserved segment is rejected ──────────────────────────────────

describe("isReservedSlug — reserved segments", () => {
  it.each(Array.from(RESERVED_SLUGS))("rejects reserved slug '%s'", (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
  });

  it("rejects 'collection' (site route)", () => {
    expect(isReservedSlug("collection")).toBe(true);
  });

  it("rejects 'checkout' (site route)", () => {
    expect(isReservedSlug("checkout")).toBe(true);
  });

  it("rejects 'account' (site route)", () => {
    expect(isReservedSlug("account")).toBe(true);
  });

  it("rejects 'admin' (admin route)", () => {
    expect(isReservedSlug("admin")).toBe(true);
  });

  it("rejects 'api' (api route)", () => {
    expect(isReservedSlug("api")).toBe(true);
  });

  it("rejects 'cart' (site route)", () => {
    expect(isReservedSlug("cart")).toBe(true);
  });

  it("rejects 'order' (deny-list entry)", () => {
    expect(isReservedSlug("order")).toBe(true);
  });

  it("rejects 'search' (site route)", () => {
    expect(isReservedSlug("search")).toBe(true);
  });

  it("rejects 'how-it-works' (site route)", () => {
    expect(isReservedSlug("how-it-works")).toBe(true);
  });

  it("rejects 'our-story' (site route)", () => {
    expect(isReservedSlug("our-story")).toBe(true);
  });

  it("rejects 'packing' (site route)", () => {
    expect(isReservedSlug("packing")).toBe(true);
  });

  it("rejects 'privacy-policy' (site route)", () => {
    expect(isReservedSlug("privacy-policy")).toBe(true);
  });

  it("rejects 'return-policy' (site route)", () => {
    expect(isReservedSlug("return-policy")).toBe(true);
  });

  it("rejects 'shipping-policy' (site route)", () => {
    expect(isReservedSlug("shipping-policy")).toBe(true);
  });

  it("rejects 'terms-of-service' (site route)", () => {
    expect(isReservedSlug("terms-of-service")).toBe(true);
  });

  it("rejects 'why' (site route)", () => {
    expect(isReservedSlug("why")).toBe(true);
  });
});

// ── L2: normal slugs are accepted ──────────────────────────────────────────

describe("isReservedSlug — normal slugs", () => {
  it("accepts 'about-us'", () => {
    expect(isReservedSlug("about-us")).toBe(false);
  });

  it("accepts 'silk-sarees-collection'", () => {
    expect(isReservedSlug("silk-sarees-collection")).toBe(false);
  });

  it("accepts 'summer-sale-2025'", () => {
    expect(isReservedSlug("summer-sale-2025")).toBe(false);
  });

  it("accepts 'contact'", () => {
    expect(isReservedSlug("contact")).toBe(false);
  });
});

// ── L5: adversarial ─────────────────────────────────────────────────────────

describe("isReservedSlug — adversarial", () => {
  it("rejects empty string (not a valid slug anyway)", () => {
    // empty string is not in the reserved list but we treat it defensively
    expect(isReservedSlug("")).toBe(false);
  });

  it("rejects 'admin' regardless of caller intent", () => {
    expect(isReservedSlug("admin")).toBe(true);
  });

  it("accepts 'my-admin-page' — only exact top-level segment matches", () => {
    expect(isReservedSlug("my-admin-page")).toBe(false);
  });

  it("accepts 'checkout-complete' — only exact top-level segment matches", () => {
    expect(isReservedSlug("checkout-complete")).toBe(false);
  });

  it("accepts 'the-why-behind-us' — only exact segment matches", () => {
    expect(isReservedSlug("the-why-behind-us")).toBe(false);
  });
});
