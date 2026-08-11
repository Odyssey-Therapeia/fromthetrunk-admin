/**
 * Phase 2A.2 — Merchant image safety + selection (pure).
 *
 * What these tests prove:
 *   - The eligibility rules match Merchant's published limits exactly, at the
 *     boundaries: 16 MB, 64 MP, 250×250.
 *   - Unknown filesize and unknown dimensions FAIL CLOSED — which is why the
 *     production catalogue (width/height null) needs the metadata backfill
 *     before it can be synced.
 *   - Selection never rejects a product for an unsafe EXTRA image: the first
 *     safe image is promoted to primary and the rest are simply left out.
 *   - Identical resolved URLs are deduplicated, so no URL can appear twice.
 *   - Original sort order survives among the safe images.
 */

import { describe, expect, it } from "vitest";

import type { ProductWithRelations } from "@/db/queries/products";
import {
  MERCHANT_MAX_ADDITIONAL_IMAGES,
  MERCHANT_MAX_IMAGE_BYTES,
  MERCHANT_MAX_IMAGE_PIXELS,
  MERCHANT_MIN_APPAREL_HEIGHT,
  MERCHANT_MIN_APPAREL_WIDTH,
  collectIgnoredImageReasons,
  evaluateMerchantImageSafety,
  isSupportedMerchantMimeType,
  selectMerchantImages,
  toPublicMerchantImageUrl,
} from "@/lib/google-merchant/image-safety";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BLOB = "https://store.public.blob.vercel-storage.com";

const media = (overrides: Record<string, unknown> = {}) => ({
  filesize: 2_000_000,
  height: 1600,
  id: "media-1",
  mimeType: "image/jpeg",
  width: 1200,
  ...overrides,
});

const evaluate = (overrides: Record<string, unknown> = {}, url = `${BLOB}/a.jpg`) =>
  evaluateMerchantImageSafety(media(overrides), url);

const mkProduct = (
  images: Array<{ media: Record<string, unknown>; sortOrder: number }>,
): ProductWithRelations => ({ images }) as unknown as ProductWithRelations;

const image = (
  sortOrder: number,
  url: string,
  overrides: Record<string, unknown> = {},
) => ({ media: media({ id: `media-${sortOrder}`, url, ...overrides }), sortOrder });

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

describe("Merchant image policy", () => {
  it("matches the published Merchant limits", () => {
    expect(MERCHANT_MAX_IMAGE_BYTES).toBe(16_000_000);
    expect(MERCHANT_MAX_IMAGE_PIXELS).toBe(64_000_000);
    expect(MERCHANT_MIN_APPAREL_WIDTH).toBe(250);
    expect(MERCHANT_MIN_APPAREL_HEIGHT).toBe(250);
    expect(MERCHANT_MAX_ADDITIONAL_IMAGES).toBe(10);
  });

  it("supports only jpeg, png and webp", () => {
    expect(isSupportedMerchantMimeType("image/jpeg")).toBe(true);
    expect(isSupportedMerchantMimeType("image/png")).toBe(true);
    expect(isSupportedMerchantMimeType("image/webp")).toBe(true);
    expect(isSupportedMerchantMimeType("image/jpeg; charset=binary")).toBe(true);
    expect(isSupportedMerchantMimeType("IMAGE/JPEG")).toBe(true);

    for (const unsupported of [
      "image/gif",
      "image/avif",
      "image/heic",
      "image/svg+xml",
      "application/octet-stream",
      "image/*",
      null,
      undefined,
      "",
    ]) {
      expect(isSupportedMerchantMimeType(unsupported)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Safe
// ---------------------------------------------------------------------------

describe("evaluateMerchantImageSafety — safe", () => {
  it("accepts a normal jpeg", () => {
    expect(evaluate()).toEqual({ reasons: [], safe: true });
  });

  it("accepts png and webp", () => {
    expect(evaluate({ mimeType: "image/png" }).safe).toBe(true);
    expect(evaluate({ mimeType: "image/webp" }).safe).toBe(true);
  });

  it("accepts exactly 250x250", () => {
    expect(evaluate({ height: 250, width: 250 }).safe).toBe(true);
  });

  it("accepts exactly the maximum byte limit", () => {
    expect(evaluate({ filesize: MERCHANT_MAX_IMAGE_BYTES }).safe).toBe(true);
  });

  it("accepts exactly 64,000,000 pixels", () => {
    expect(evaluate({ height: 8000, width: 8000 }).safe).toBe(true);
    expect(8000 * 8000).toBe(MERCHANT_MAX_IMAGE_PIXELS);
  });

  it("accepts a site-relative URL resolved against the storefront", () => {
    expect(
      evaluateMerchantImageSafety(media(), "/media/local.jpg").safe,
    ).toBe(true);
    expect(toPublicMerchantImageUrl("/media/local.jpg")).toBe(
      "https://www.fromthetrunk.shop/media/local.jpg",
    );
  });
});

// ---------------------------------------------------------------------------
// Unsafe
// ---------------------------------------------------------------------------

describe("evaluateMerchantImageSafety — unsafe", () => {
  const cases: Array<{
    label: string;
    overrides: Record<string, unknown>;
    reason: string;
  }> = [
    { label: "missing filesize", overrides: { filesize: null }, reason: "FILESIZE_MISSING" },
    { label: "zero filesize", overrides: { filesize: 0 }, reason: "FILESIZE_MISSING" },
    { label: "missing width", overrides: { width: null }, reason: "DIMENSIONS_MISSING" },
    { label: "missing height", overrides: { height: null }, reason: "DIMENSIONS_MISSING" },
    { label: "zero width", overrides: { width: 0 }, reason: "DIMENSIONS_MISSING" },
    { label: "zero height", overrides: { height: 0 }, reason: "DIMENSIONS_MISSING" },
    {
      label: "a file over 16 MB",
      overrides: { filesize: MERCHANT_MAX_IMAGE_BYTES + 1 },
      reason: "FILE_TOO_LARGE",
    },
    {
      label: "more than 64 MP",
      overrides: { height: 8001, width: 8000 },
      reason: "TOO_MANY_PIXELS",
    },
    { label: "width below 250", overrides: { width: 249 }, reason: "DIMENSIONS_TOO_SMALL" },
    { label: "height below 250", overrides: { height: 249 }, reason: "DIMENSIONS_TOO_SMALL" },
    {
      label: "an unsupported mime type",
      overrides: { mimeType: "image/gif" },
      reason: "UNSUPPORTED_MIME_TYPE",
    },
    {
      label: "a missing mime type",
      overrides: { mimeType: null },
      reason: "UNSUPPORTED_MIME_TYPE",
    },
  ];

  for (const { label, overrides, reason } of cases) {
    it(`rejects ${label}`, () => {
      const result = evaluate(overrides);

      expect(result.safe).toBe(false);
      expect(result.reasons).toContain(reason);
    });
  }

  it("rejects an http URL", () => {
    const result = evaluateMerchantImageSafety(media(), "http://x.test/a.jpg");

    expect(result.safe).toBe(false);
    expect(result.reasons).toContain("URL_NOT_PUBLIC_HTTPS");
  });

  it("rejects non-http schemes and a null URL", () => {
    // A bare string like "not a url" resolves as a RELATIVE path against the
    // storefront origin, which is the documented behaviour for site-relative
    // media. The real threats are non-https schemes.
    for (const url of [
      "javascript:alert(1)",
      "data:image/png;base64,iVBORw0KGgo=",
      "blob:https://www.fromthetrunk.shop/abc",
      "ftp://host.test/a.jpg",
    ]) {
      expect(evaluateMerchantImageSafety(media(), url).reasons).toContain(
        "URL_NOT_PUBLIC_HTTPS",
      );
    }

    expect(evaluateMerchantImageSafety(media(), null).reasons).toContain(
      "URL_NOT_PUBLIC_HTTPS",
    );
  });

  it("rejects a URL carrying credentials", () => {
    expect(
      evaluateMerchantImageSafety(media(), "https://u:p@host.test/a.jpg").reasons,
    ).toContain("URL_NOT_PUBLIC_HTTPS");
  });

  it("reports every failing rule at once", () => {
    const result = evaluateMerchantImageSafety(
      media({ filesize: null, height: null, mimeType: "image/gif", width: null }),
      "http://x.test/a.gif",
    );

    expect(result.reasons).toEqual([
      "URL_NOT_PUBLIC_HTTPS",
      "UNSUPPORTED_MIME_TYPE",
      "FILESIZE_MISSING",
      "DIMENSIONS_MISSING",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

describe("selectMerchantImages", () => {
  it("promotes the first SAFE image when earlier ones are oversized", () => {
    // The brief's worked example: 18 MB, 8 MB, 22 MB, 7 MB.
    const selection = selectMerchantImages(
      mkProduct([
        image(0, `${BLOB}/a.jpg`, { filesize: 18_000_000 }),
        image(1, `${BLOB}/b.jpg`, { filesize: 8_000_000 }),
        image(2, `${BLOB}/c.jpg`, { filesize: 22_000_000 }),
        image(3, `${BLOB}/d.jpg`, { filesize: 7_000_000 }),
      ]),
    );

    expect(selection.imageLink).toBe(`${BLOB}/b.jpg`);
    expect(selection.additionalImageLinks).toEqual([`${BLOB}/d.jpg`]);
    expect(selection.diagnostics).toMatchObject({
      ignoredImages: 2,
      safeImages: 2,
      totalImages: 4,
    });
  });

  it("omits unsafe additional images without failing the product", () => {
    const selection = selectMerchantImages(
      mkProduct([
        image(0, `${BLOB}/a.jpg`),
        image(1, `${BLOB}/b.jpg`, { filesize: 20_000_000 }),
        image(2, `${BLOB}/c.jpg`, { width: 100 }),
      ]),
    );

    expect(selection.imageLink).toBe(`${BLOB}/a.jpg`);
    expect(selection.additionalImageLinks).toEqual([]);
  });

  it("preserves sort order among the safe images", () => {
    const selection = selectMerchantImages(
      mkProduct([
        image(2, `${BLOB}/c.jpg`),
        image(0, `${BLOB}/a.jpg`),
        image(1, `${BLOB}/b.jpg`),
      ]),
    );

    expect(selection.imageLink).toBe(`${BLOB}/a.jpg`);
    expect(selection.additionalImageLinks).toEqual([
      `${BLOB}/b.jpg`,
      `${BLOB}/c.jpg`,
    ]);
  });

  it("deduplicates identical resolved URLs", () => {
    const selection = selectMerchantImages(
      mkProduct([
        image(0, `${BLOB}/same.jpg`),
        image(1, `${BLOB}/same.jpg`),
        image(2, `${BLOB}/other.jpg`),
      ]),
    );

    expect(selection.imageLink).toBe(`${BLOB}/same.jpg`);
    expect(selection.additionalImageLinks).toEqual([`${BLOB}/other.jpg`]);
    expect(selection.additionalImageLinks).not.toContain(selection.imageLink);
    expect(selection.diagnostics.duplicateImages).toBe(1);
  });

  it("caps additional images at 10", () => {
    const selection = selectMerchantImages(
      mkProduct(
        Array.from({ length: 15 }, (_, index) =>
          image(index, `${BLOB}/${index}.jpg`),
        ),
      ),
    );

    expect(selection.additionalImageLinks).toHaveLength(
      MERCHANT_MAX_ADDITIONAL_IMAGES,
    );
    expect(selection.additionalImageLinks[0]).toBe(`${BLOB}/1.jpg`);
  });

  it("returns no primary when every image is unsafe", () => {
    const selection = selectMerchantImages(
      mkProduct([
        image(0, `${BLOB}/a.jpg`, { filesize: 20_000_000 }),
        image(1, `${BLOB}/b.jpg`, { height: null, width: null }),
      ]),
    );

    expect(selection.imageLink).toBeNull();
    expect(selection.additionalImageLinks).toEqual([]);
    expect(collectIgnoredImageReasons(selection.diagnostics)).toEqual([
      "FILE_TOO_LARGE",
      "DIMENSIONS_MISSING",
    ]);
  });

  it("stays valid with one safe image among twenty unsafe ones", () => {
    const selection = selectMerchantImages(
      mkProduct([
        ...Array.from({ length: 10 }, (_, index) =>
          image(index, `${BLOB}/big-${index}.jpg`, { filesize: 30_000_000 }),
        ),
        image(10, `${BLOB}/good.jpg`),
        ...Array.from({ length: 10 }, (_, index) =>
          image(11 + index, `${BLOB}/bad-${index}.jpg`, { width: null }),
        ),
      ]),
    );

    expect(selection.imageLink).toBe(`${BLOB}/good.jpg`);
    expect(selection.diagnostics).toMatchObject({
      ignoredImages: 20,
      safeImages: 1,
      totalImages: 21,
    });
  });

  it("is valid with a safe primary and no additional images", () => {
    const selection = selectMerchantImages(mkProduct([image(0, `${BLOB}/a.jpg`)]));

    expect(selection.imageLink).toBe(`${BLOB}/a.jpg`);
    expect(selection.additionalImageLinks).toEqual([]);
  });

  it("handles a product with no images", () => {
    const selection = selectMerchantImages(mkProduct([]));

    expect(selection.imageLink).toBeNull();
    expect(selection.diagnostics.totalImages).toBe(0);
  });

  it("records media id, sort order and reasons for each ignored image", () => {
    const selection = selectMerchantImages(
      mkProduct([image(3, `${BLOB}/a.jpg`, { filesize: 30_000_000 })]),
    );

    expect(selection.diagnostics.ignored).toEqual([
      { mediaId: "media-3", reasons: ["FILE_TOO_LARGE"], sortOrder: 3 },
    ]);
  });

  it("models the production Maroon case: two oversized images dropped", () => {
    // Recorded sizes from the rejected product, in sort order.
    const sizes = [11_980_000, 11_750_000, 13_070_000, 22_480_000, 17_840_000, 10_050_000];

    const selection = selectMerchantImages(
      mkProduct(
        sizes.map((filesize, index) =>
          image(index, `${BLOB}/maroon-${index}.jpg`, { filesize }),
        ),
      ),
    );

    expect(selection.imageLink).toBe(`${BLOB}/maroon-0.jpg`);
    expect(selection.additionalImageLinks).toEqual([
      `${BLOB}/maroon-1.jpg`,
      `${BLOB}/maroon-2.jpg`,
      `${BLOB}/maroon-5.jpg`,
    ]);
    // sort 3 (22.48 MB) and sort 4 (17.84 MB) are the two that Google rejected.
    expect(selection.diagnostics.ignored.map((entry) => entry.sortOrder)).toEqual(
      [3, 4],
    );
  });
});
