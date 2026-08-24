/**
 * Phase 2A.2 — image safety as seen through ProductInput and readiness.
 *
 * What these tests prove END TO END:
 *   - The ProductInput submits the SELECTED safe images, and an unsafe original
 *     primary or extra never reaches Google.
 *   - Everything else the shared mapper provides — title, description, price,
 *     apparel attributes, canonical link — is unchanged by this phase.
 *   - Readiness uses the same selector: some-unsafe-some-safe is still READY,
 *     zero-safe is NO_MERCHANT_SAFE_IMAGE with detailed reason codes, and
 *     missing metadata fails closed.
 *   - The ProductInput attached to a READY audit carries exactly the same safe
 *     selection the mapper would produce — the Phase 2A invariant.
 */

import { describe, expect, it } from "vitest";

import type { ProductWithRelations } from "@/db/queries/products";
import { auditMerchantProduct } from "@/lib/google-merchant/catalogue-readiness";
import { selectMerchantImages } from "@/lib/google-merchant/image-safety";
import { buildMerchantProductInput } from "@/lib/google-merchant/product-input";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-01T00:00:00.000Z");
const BLOB = "https://store.public.blob.vercel-storage.com";

const mkMedia = (
  url: string,
  overrides: Record<string, unknown> = {},
  id = url,
) => ({
  alt: null,
  blurDataUrl: null,
  createdAt: NOW,
  filename: "img.jpg",
  filesize: 2_000_000,
  height: 1600,
  id,
  key: "media/img.jpg",
  metadata: null,
  mimeType: "image/jpeg",
  updatedAt: NOW,
  url,
  width: 1200,
  ...overrides,
});

const mkProduct = (
  images: Array<{ media: Record<string, unknown>; sortOrder: number }>,
): ProductWithRelations =>
  ({
    attributes: {
      age_group: "ADULT",
      color: "Maroon",
      fabric: "Cotton",
      gender: "FEMALE",
      size: "OS",
    },
    createdAt: NOW,
    detailsDesigner: null,
    detailsFabric: "Cotton",
    id: "0768b66c-4a38-4135-801d-87bbc95a096b",
    images,
    name: "Maroon chettinad cotton",
    pricePaise: 429900,
    quantityAvailable: 1,
    slug: "maroon-chettinad-cotton",
    status: "published",
    stockStatus: "available",
    storyNarrative: "A maroon chettinad cotton saree.",
    storyTitle: "Maroon",
    tags: [],
    updatedAt: NOW,
  }) as unknown as ProductWithRelations;

const build = (product: ProductWithRelations) =>
  buildMerchantProductInput({ effectiveStockStatus: "available", product });

// The production Maroon sizes, in sort order. Sorts 3 and 4 exceed 16 MB.
const MAROON_SIZES = [
  11_980_000, 11_750_000, 13_070_000, 22_480_000, 17_840_000, 10_050_000,
];

const maroonProduct = () =>
  mkProduct(
    MAROON_SIZES.map((filesize, index) => ({
      media: mkMedia(`${BLOB}/maroon-${index}.jpg`, { filesize }),
      sortOrder: index,
    })),
  );

// ---------------------------------------------------------------------------
// ProductInput
// ---------------------------------------------------------------------------

describe("buildMerchantProductInput — Merchant-safe images", () => {
  it("submits only the compliant Maroon images", () => {
    const attributes = build(maroonProduct()).productAttributes;

    expect(attributes.imageLink).toBe(`${BLOB}/maroon-0.jpg`);
    expect(attributes.additionalImageLinks).toEqual([
      `${BLOB}/maroon-1.jpg`,
      `${BLOB}/maroon-2.jpg`,
      `${BLOB}/maroon-5.jpg`,
    ]);
  });

  it("never submits an image Google rejected for size", () => {
    const attributes = build(maroonProduct()).productAttributes;
    const submitted = [
      attributes.imageLink,
      ...attributes.additionalImageLinks,
    ];

    expect(submitted).not.toContain(`${BLOB}/maroon-3.jpg`);
    expect(submitted).not.toContain(`${BLOB}/maroon-4.jpg`);
  });

  it("promotes the second image when the original primary is unsafe", () => {
    const attributes = build(
      mkProduct([
        { media: mkMedia(`${BLOB}/big.jpg`, { filesize: 18_280_000 }), sortOrder: 0 },
        { media: mkMedia(`${BLOB}/ok.jpg`), sortOrder: 1 },
      ]),
    ).productAttributes;

    expect(attributes.imageLink).toBe(`${BLOB}/ok.jpg`);
    expect(attributes.additionalImageLinks).toEqual([]);
  });

  it("drops an unsafe additional image without failing the product", () => {
    const attributes = build(
      mkProduct([
        { media: mkMedia(`${BLOB}/ok.jpg`), sortOrder: 0 },
        { media: mkMedia(`${BLOB}/huge.jpg`, { filesize: 30_000_000 }), sortOrder: 1 },
      ]),
    ).productAttributes;

    expect(attributes.imageLink).toBe(`${BLOB}/ok.jpg`);
    expect(attributes.additionalImageLinks).toEqual([]);
  });

  it("leaves title, description, price, link and apparel mapping untouched", () => {
    const attributes = build(maroonProduct()).productAttributes;

    expect(attributes.title).toBe("Maroon chettinad cotton");
    expect(attributes.description).toBe("A maroon chettinad cotton saree.");
    expect(attributes.price).toEqual({
      amountMicros: "4299000000",
      currencyCode: "INR",
    });
    expect(attributes.link).toBe(
      "https://www.fromthetrunk.shop/collection/maroon-chettinad-cotton",
    );
    expect(attributes.canonicalLink).toBe(attributes.link);
    expect(attributes.material).toBe("Cotton");
    expect(attributes.color).toBe("Maroon");
    expect(attributes.gender).toBe("female");
    expect(attributes.ageGroup).toBe("adult");
    expect(attributes.size).toBe("OS");
    expect(attributes.availability).toBe("IN_STOCK");
    expect(attributes.condition).toBe("USED");
    expect(attributes.identifierExists).toBe(false);
  });

  it("fails closed when every image is oversized", () => {
    let caught: unknown = null;
    try {
      build(
        mkProduct([
          { media: mkMedia(`${BLOB}/a.jpg`, { filesize: 20_000_000 }), sortOrder: 0 },
          { media: mkMedia(`${BLOB}/b.jpg`, { filesize: 30_000_000 }), sortOrder: 1 },
        ]),
      );
    } catch (error) {
      caught = error;
    }

    expect((caught as { code: string }).code).toBe("MERCHANT_NO_SAFE_IMAGE");
  });

  it("fails closed when dimensions are unknown (pre-backfill state)", () => {
    let caught: unknown = null;
    try {
      build(
        mkProduct([
          {
            media: mkMedia(`${BLOB}/a.jpg`, { height: null, width: null }),
            sortOrder: 0,
          },
        ]),
      );
    } catch (error) {
      caught = error;
    }

    expect((caught as { code: string }).code).toBe("MERCHANT_NO_SAFE_IMAGE");
  });
});

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

describe("auditMerchantProduct — Merchant image readiness", () => {
  it("is READY when at least one image is safe", () => {
    const { report } = auditMerchantProduct(
      maroonProduct(),
      "available",
      "preloved-saree",
    );

    expect(report.merchantReadiness).toBe("READY");
    expect(report.images).toEqual({
      ignoredImages: 2,
      safeImages: 4,
      totalImages: 6,
    });
  });

  it("is READY with 4 safe images among 10", () => {
    const { report } = auditMerchantProduct(
      mkProduct([
        ...Array.from({ length: 6 }, (_, index) => ({
          media: mkMedia(`${BLOB}/big-${index}.jpg`, { filesize: 20_000_000 }),
          sortOrder: index,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          media: mkMedia(`${BLOB}/ok-${index}.jpg`),
          sortOrder: 6 + index,
        })),
      ]),
      "available",
      "preloved-saree",
    );

    expect(report.merchantReadiness).toBe("READY");
    expect(report.images).toEqual({
      ignoredImages: 6,
      safeImages: 4,
      totalImages: 10,
    });
  });

  it("blocks NO_MERCHANT_SAFE_IMAGE when every image is oversized", () => {
    const { report, productInput } = auditMerchantProduct(
      mkProduct([
        { media: mkMedia(`${BLOB}/a.jpg`, { filesize: 20_000_000 }), sortOrder: 0 },
      ]),
      "available",
      "preloved-saree",
    );

    expect(report.merchantReadiness).toBe("NO_MERCHANT_SAFE_IMAGE");
    expect(report.reasons).toEqual(["merchant_image_too_large"]);
    expect(productInput).toBeNull();
  });

  it("reports the detailed reason for each kind of image problem", () => {
    const cases: Array<{ overrides: Record<string, unknown>; reason: string }> = [
      { overrides: { filesize: null }, reason: "merchant_image_filesize_missing" },
      { overrides: { filesize: 20_000_000 }, reason: "merchant_image_too_large" },
      {
        overrides: { height: null, width: null },
        reason: "merchant_image_dimensions_missing",
      },
      {
        overrides: { height: 100, width: 100 },
        reason: "merchant_image_dimensions_too_small",
      },
      {
        overrides: { height: 9000, width: 9000 },
        reason: "merchant_image_too_many_pixels",
      },
      { overrides: { mimeType: "image/gif" }, reason: "merchant_image_mime_unsupported" },
    ];

    for (const { overrides, reason } of cases) {
      const { report } = auditMerchantProduct(
        mkProduct([{ media: mkMedia(`${BLOB}/a.jpg`, overrides), sortOrder: 0 }]),
        "available",
        "preloved-saree",
      );

      expect(report.merchantReadiness).toBe("NO_MERCHANT_SAFE_IMAGE");
      expect(report.reasons).toContain(reason);
    }
  });

  it("reports every distinct image problem across the product", () => {
    const { report } = auditMerchantProduct(
      mkProduct([
        { media: mkMedia(`${BLOB}/a.jpg`, { filesize: 20_000_000 }), sortOrder: 0 },
        { media: mkMedia(`${BLOB}/b.jpg`, { width: null }), sortOrder: 1 },
      ]),
      "available",
      "preloved-saree",
    );

    expect(report.reasons).toEqual([
      "merchant_image_too_large",
      "merchant_image_dimensions_missing",
    ]);
  });

  it("attaches the ProductInput that uses exactly the same safe selection", () => {
    const product = maroonProduct();
    const { productInput } = auditMerchantProduct(
      product,
      "available",
      "preloved-saree",
    );
    const selection = selectMerchantImages(product);

    expect(productInput?.productAttributes.imageLink).toBe(selection.imageLink);
    expect(productInput?.productAttributes.additionalImageLinks).toEqual(
      selection.additionalImageLinks,
    );
  });

  it("keeps internal diagnostics without exposing them in the report", () => {
    const { imageDiagnostics, report } = auditMerchantProduct(
      maroonProduct(),
      "available",
      "preloved-saree",
    );

    expect(imageDiagnostics.ignored).toEqual([
      { mediaId: `${BLOB}/maroon-3.jpg`, reasons: ["FILE_TOO_LARGE"], sortOrder: 3 },
      { mediaId: `${BLOB}/maroon-4.jpg`, reasons: ["FILE_TOO_LARGE"], sortOrder: 4 },
    ]);
    expect(Object.keys(report.images).sort()).toEqual([
      "ignoredImages",
      "safeImages",
      "totalImages",
    ]);
    expect(JSON.stringify(report)).not.toContain("mediaId");
  });
});
