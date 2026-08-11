/**
 * Product → Merchant API ProductInput mapping (pure).
 *
 * What these tests prove:
 *   - The offer is keyed on the product UUID, never the slug.
 *   - Paise → micros is exact BigInt arithmetic (₹5,249 → "5249000000").
 *   - Title/description/link/images come from the shared feed mapper, so the
 *     Merchant offer cannot drift from the storefront and the RSS feed.
 *   - Brand is submitted ONLY for a recognised label; placeholder, generic,
 *     curation and descriptive designer text are refused, and the store's own
 *     name is never submitted as a manufacturer.
 *   - identifierExists is always false — no GTIN/MPN is ever invented.
 *   - Missing apparel attributes raise a typed 422 carrying field names only.
 *   - Unusable product data (no image, http image, bad price, non-canonical
 *     landing page, not purchasable) fails closed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductWithRelations } from "@/db/queries/products";
import {
  GoogleMerchantError,
  GoogleMerchantProductDataError,
} from "@/lib/google-merchant/config";
import {
  TEST_INSERT_PRODUCT_ID,
  TEST_INSERT_PRODUCT_SLUG,
  buildMerchantProductInput,
  resolveApparelAttributes,
  resolveVerifiedBrand,
} from "@/lib/google-merchant/product-input";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-01T00:00:00.000Z");
const CANONICAL_LINK = `https://www.fromthetrunk.shop/collection/${TEST_INSERT_PRODUCT_SLUG}`;

const mkMedia = (url: string, id = "media-1") => ({
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
});

/** Complete apparel attributes — the shape a Merchant-ready product needs. */
const COMPLETE_ATTRIBUTES = {
  ageGroup: "adult",
  color: "Tangerine",
  fabric: "Chiffon",
  gender: "female",
  size: "Free Size",
};

function mkProduct(
  overrides: Record<string, unknown> = {},
): ProductWithRelations {
  return {
    artisanId: null,
    attributes: { ...COMPLETE_ATTRIBUTES },
    collection: null,
    collectionId: null,
    createdAt: NOW,
    detailsCondition: "Excellent condition",
    detailsDesigner: null,
    detailsFabric: "Chiffon",
    detailsLength: null,
    detailsWidth: null,
    featured: false,
    id: TEST_INSERT_PRODUCT_ID,
    images: [
      {
        media: mkMedia("https://blob.vercel-storage.com/img1.jpg"),
        sortOrder: 0,
      },
    ],
    metadata: null,
    name: "Tangerine Noir Floral Border Weave",
    originalPricePaise: null,
    pricePaise: 524900,
    quantityAvailable: 1,
    reservedUntil: null,
    slug: TEST_INSERT_PRODUCT_SLUG,
    soldAt: null,
    status: "published",
    stockStatus: "available",
    storyEra: null,
    storyNarrative: "A tangerine chiffon with a noir floral border.",
    storyProvenance: null,
    storyTitle: "Tangerine Noir",
    tags: [],
    typeId: null,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProductWithRelations;
}

const build = (overrides: Record<string, unknown> = {}) =>
  buildMerchantProductInput({
    effectiveStockStatus: "available",
    product: mkProduct(overrides),
  });

const expectMerchantError = (fn: () => unknown, code: string) => {
  let caught: unknown = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(GoogleMerchantError);
  const error = caught as GoogleMerchantError;
  expect(error.code).toBe(code);
  return error;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Identity + price
// ---------------------------------------------------------------------------

describe("buildMerchantProductInput — offer identity", () => {
  it("uses the product UUID as offerId, not the slug", () => {
    const input = build();

    expect(input.offerId).toBe(TEST_INSERT_PRODUCT_ID);
    expect(input.offerId).not.toBe(TEST_INSERT_PRODUCT_SLUG);
    expect(input.offerId).not.toContain("tangerine");
  });

  it("keeps the offer keyed on the UUID even if the slug changes", () => {
    const input = buildMerchantProductInput({
      effectiveStockStatus: "available",
      product: mkProduct({ slug: "renamed-saree" }),
    });

    expect(input.offerId).toBe(TEST_INSERT_PRODUCT_ID);
  });

  it("submits contentLanguage en and feedLabel IN", () => {
    const input = build();

    expect(input.contentLanguage).toBe("en");
    expect(input.feedLabel).toBe("IN");
  });
});

describe("buildMerchantProductInput — price", () => {
  it("converts ₹5,249 (524900 paise) to 5249000000 micros", () => {
    expect(build().productAttributes.price).toEqual({
      amountMicros: "5249000000",
      currencyCode: "INR",
    });
  });

  it("uses exact integer arithmetic at the top of the paise column range", () => {
    // 2^31-1 paise — the largest value the integer column can hold.
    const input = build({ pricePaise: 2147483647 });

    expect(input.productAttributes.price.amountMicros).toBe("21474836470000");
    expect(input.productAttributes.price.amountMicros).toBe(
      (BigInt(2147483647) * BigInt(10000)).toString(),
    );
  });

  it("never degrades to floating-point (no exponential notation)", () => {
    // Beyond anything the column can hold, but it is the case that separates
    // BigInt from `pricePaise * 10000`: the float path stringifies to
    // "1.2345678901234568e+21", which Google would reject outright.
    const pricePaise = 123456789012345678;
    const input = build({ pricePaise });

    expect(input.productAttributes.price.amountMicros).toMatch(/^\d+$/);
    expect(input.productAttributes.price.amountMicros).toBe(
      (BigInt(pricePaise) * BigInt(10000)).toString(),
    );
    expect(String(pricePaise * 10000)).toContain("e+");
  });

  it("emits micros as a string, never a number", () => {
    expect(typeof build().productAttributes.price.amountMicros).toBe("string");
  });

  it("rejects a zero price", () => {
    expectMerchantError(() => build({ pricePaise: 0 }), "PRODUCT_PRICE_INVALID");
  });

  it("rejects a negative price", () => {
    expectMerchantError(
      () => build({ pricePaise: -100 }),
      "PRODUCT_PRICE_INVALID",
    );
  });

  it("rejects a non-integer price", () => {
    expectMerchantError(
      () => build({ pricePaise: 524900.5 }),
      "PRODUCT_PRICE_INVALID",
    );
  });
});

// ---------------------------------------------------------------------------
// Shared mapper reuse
// ---------------------------------------------------------------------------

describe("buildMerchantProductInput — mapped content", () => {
  it("takes title, description and links from the shared feed mapper", () => {
    const attributes = build().productAttributes;

    expect(attributes.title).toBe("Tangerine Noir Floral Border Weave");
    expect(attributes.description).toBe(
      "A tangerine chiffon with a noir floral border.",
    );
    expect(attributes.link).toBe(CANONICAL_LINK);
    expect(attributes.canonicalLink).toBe(CANONICAL_LINK);
  });

  it("uses the first image as imageLink and keeps additional images in sortOrder", () => {
    const input = build({
      images: [
        { media: mkMedia("https://cdn.example.com/c.jpg", "m3"), sortOrder: 2 },
        { media: mkMedia("https://cdn.example.com/a.jpg", "m1"), sortOrder: 0 },
        { media: mkMedia("https://cdn.example.com/b.jpg", "m2"), sortOrder: 1 },
      ],
    });

    expect(input.productAttributes.imageLink).toBe(
      "https://cdn.example.com/a.jpg",
    );
    expect(input.productAttributes.additionalImageLinks).toEqual([
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/c.jpg",
    ]);
  });

  it("absolutises a site-relative image against the canonical origin", () => {
    const input = build({
      images: [{ media: mkMedia("/media/local.jpg"), sortOrder: 0 }],
    });

    expect(input.productAttributes.imageLink).toBe(
      "https://www.fromthetrunk.shop/media/local.jpg",
    );
  });

  it("caps additional images at Google's limit of 10", () => {
    const input = build({
      images: Array.from({ length: 14 }, (_, index) => ({
        media: mkMedia(`https://cdn.example.com/${index}.jpg`, `m${index}`),
        sortOrder: index,
      })),
    });

    expect(input.productAttributes.additionalImageLinks).toHaveLength(10);
    expect(input.productAttributes.additionalImageLinks[0]).toBe(
      "https://cdn.example.com/1.jpg",
    );
  });

  it("takes material from the existing display-details fabric logic", () => {
    expect(build().productAttributes.material).toBe("Chiffon");
    expect(
      build({ detailsFabric: null, name: "Banarasi weave" }).productAttributes
        .material,
    ).toBe("Banarasi silk");
  });

  it("rejects a product with no images", () => {
    expectMerchantError(() => build({ images: [] }), "PRODUCT_IMAGE_MISSING");
  });

  it("rejects a non-https primary image", () => {
    expectMerchantError(
      () => build({ images: [{ media: mkMedia("http://x.test/a.jpg"), sortOrder: 0 }] }),
      "MERCHANT_NO_SAFE_IMAGE",
    );
  });

  it("rejects an unresolvable primary image", () => {
    expectMerchantError(
      () => build({ images: [{ media: { url: 42 }, sortOrder: 0 }] }),
      "MERCHANT_NO_SAFE_IMAGE",
    );
  });

  it("drops unusable additional images but keeps the insert", () => {
    const input = build({
      images: [
        { media: mkMedia("https://cdn.example.com/a.jpg", "m1"), sortOrder: 0 },
        { media: mkMedia("http://cdn.example.com/b.jpg", "m2"), sortOrder: 1 },
        { media: mkMedia("https://cdn.example.com/c.jpg", "m3"), sortOrder: 2 },
      ],
    });

    expect(input.productAttributes.additionalImageLinks).toEqual([
      "https://cdn.example.com/c.jpg",
    ]);
  });

});

// ---------------------------------------------------------------------------
// Landing page — pinned to the claimed storefront, not to the app domain
// ---------------------------------------------------------------------------

describe("buildMerchantProductInput — landing page origin", () => {
  const nonStorefrontOrigins = [
    "http://localhost:3001",
    "https://admin.fromthetrunk.shop",
    "https://ftt-admin-git-preview-odyssey-therapeia.vercel.app",
    "https://fromthetrunk.shop",
  ];

  for (const origin of nonStorefrontOrigins) {
    it(`ignores NEXT_PUBLIC_SERVER_URL=${origin}`, () => {
      vi.stubEnv("NEXT_PUBLIC_SERVER_URL", origin);

      const attributes = build().productAttributes;

      expect(attributes.link).toBe(CANONICAL_LINK);
      expect(attributes.canonicalLink).toBe(CANONICAL_LINK);
      expect(attributes.link).not.toContain("admin.");
      expect(attributes.link).not.toContain("localhost");
      expect(attributes.link).not.toContain("vercel.app");
    });
  }

  it("always emits https on www.fromthetrunk.shop", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://admin.fromthetrunk.shop");

    const url = new URL(build().productAttributes.link);

    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.fromthetrunk.shop");
    expect(url.pathname).toBe(`/collection/${TEST_INSERT_PRODUCT_SLUG}`);
  });

  it("carries no credentials, query string or fragment", () => {
    const url = new URL(build().productAttributes.link);

    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it("builds the canonical storefront path for a changed slug", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://admin.fromthetrunk.shop");

    const attributes = build({ slug: "renamed-tangerine-saree" })
      .productAttributes;

    expect(attributes.link).toBe(
      "https://www.fromthetrunk.shop/collection/renamed-tangerine-saree",
    );
    expect(attributes.canonicalLink).toBe(attributes.link);
  });

  it("keeps link and canonicalLink identical", () => {
    const attributes = build().productAttributes;

    expect(attributes.canonicalLink).toBe(attributes.link);
  });

  const unusableSlugs: Array<{ label: string; slug: string }> = [
    { label: "a traversal attempt", slug: "../../evil" },
    { label: "an embedded query string", slug: "saree?utm_source=x" },
    { label: "an embedded fragment", slug: "saree#reviews" },
    { label: "a space", slug: "tangerine noir" },
  ];

  for (const { label, slug } of unusableSlugs) {
    it(`rejects a slug containing ${label}`, () => {
      expectMerchantError(() => build({ slug }), "PRODUCT_LINK_INVALID");
    });
  }
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

describe("buildMerchantProductInput — availability", () => {
  it("submits the Merchant enum values", () => {
    const attributes = build().productAttributes;

    expect(attributes.availability).toBe("IN_STOCK");
    expect(attributes.condition).toBe("USED");
  });

  it("refuses a reserved effective status", () => {
    expectMerchantError(
      () =>
        buildMerchantProductInput({
          effectiveStockStatus: "reserved",
          product: mkProduct(),
        }),
      "PRODUCT_NOT_PURCHASABLE",
    );
  });

  it("refuses a sold effective status", () => {
    expectMerchantError(
      () =>
        buildMerchantProductInput({
          effectiveStockStatus: "sold",
          product: mkProduct(),
        }),
      "PRODUCT_NOT_PURCHASABLE",
    );
  });

  it("refuses when the stockStatus column disagrees with the effective status", () => {
    expectMerchantError(
      () =>
        buildMerchantProductInput({
          effectiveStockStatus: "available",
          product: mkProduct({ stockStatus: "reserved" }),
        }),
      "PRODUCT_NOT_PURCHASABLE",
    );
  });
});

// ---------------------------------------------------------------------------
// Brand + identifiers
// ---------------------------------------------------------------------------

describe("resolveVerifiedBrand", () => {
  const unverified = [
    null,
    undefined,
    "",
    "   ",
    "Unknown",
    "N/A",
    "-",
    "From the Trunk",
    "FTT",
    "Handloom weaver, Kanchipuram",
    "Curated by our founder",
    "A rare vintage weave from a private collection",
    "Designer",
    "Artisan",
    "test",
  ];

  for (const value of unverified) {
    it(`does not treat ${JSON.stringify(value)} as a brand`, () => {
      expect(resolveVerifiedBrand(value)).toBeNull();
    });
  }

  it("accepts a recognised label", () => {
    expect(resolveVerifiedBrand("Nalli")).toBe("Nalli");
    expect(resolveVerifiedBrand("Raw Mango")).toBe("Raw Mango");
  });

  it("matches a recognised label regardless of casing and spacing", () => {
    expect(resolveVerifiedBrand("  raw-mango ")).toBe("raw-mango");
    expect(resolveVerifiedBrand("SABYASACHI")).toBe("SABYASACHI");
  });

  it("does not accept a recognised label embedded in a sentence", () => {
    expect(resolveVerifiedBrand("Inspired by Sabyasachi")).toBeNull();
  });
});

describe("buildMerchantProductInput — brand and identifiers", () => {
  it("omits brand when the designer field is not a verified label", () => {
    const attributes = build({
      detailsDesigner: "Handloom weaver, Kanchipuram",
    }).productAttributes;

    expect(attributes.brand).toBeUndefined();
    expect("brand" in attributes).toBe(false);
    expect(attributes.identifierExists).toBe(false);
  });

  it("omits brand when there is no designer at all", () => {
    expect(build().productAttributes.brand).toBeUndefined();
  });

  it("never submits the retailer name as a brand", () => {
    expect(
      build({ detailsDesigner: "From the Trunk" }).productAttributes.brand,
    ).toBeUndefined();
  });

  it("submits a verified brand when the designer names a recognised label", () => {
    const attributes = build({ detailsDesigner: "Raw Mango" })
      .productAttributes;

    expect(attributes.brand).toBe("Raw Mango");
  });

  it("keeps identifierExists false even when a brand is verified", () => {
    const attributes = build({ detailsDesigner: "Nalli" }).productAttributes;

    expect(attributes.brand).toBe("Nalli");
    expect(attributes.identifierExists).toBe(false);
  });

  it("never invents a gtin or mpn", () => {
    const attributes = build({ detailsDesigner: "Nalli" }).productAttributes;

    expect(Object.keys(attributes)).not.toContain("gtin");
    expect(Object.keys(attributes)).not.toContain("mpn");
  });
});

// ---------------------------------------------------------------------------
// Apparel attributes
// ---------------------------------------------------------------------------

describe("resolveApparelAttributes", () => {
  it("reads all four fields from products.attributes", () => {
    const { missing, values } = resolveApparelAttributes(mkProduct());

    expect(missing).toEqual([]);
    expect(values).toEqual({
      ageGroup: "adult",
      color: "Tangerine",
      gender: "female",
      size: "Free Size",
    });
  });

  it("accepts key spelling variants", () => {
    const { missing, values } = resolveApparelAttributes(
      mkProduct({
        attributes: {
          "Age Group": "Adult",
          colour: "Noir",
          gender: "Female",
          size: "Free",
        },
      }),
    );

    expect(missing).toEqual([]);
    expect(values.color).toBe("Noir");
    expect(values.ageGroup).toBe("adult");
    expect(values.gender).toBe("female");
  });

  it("does not infer colour from the product title", () => {
    const { missing, values } = resolveApparelAttributes(
      mkProduct({
        attributes: { ageGroup: "adult", gender: "female", size: "Free Size" },
        name: "Tangerine Noir Floral Border Weave",
      }),
    );

    expect(missing).toEqual(["color"]);
    expect(values.color).toBeUndefined();
  });

  it("does not treat the drape length as an apparel size", () => {
    const { missing } = resolveApparelAttributes(
      mkProduct({
        attributes: { ageGroup: "adult", color: "Tangerine", gender: "female" },
        detailsLength: "6.3 metres",
      }),
    );

    expect(missing).toEqual(["size"]);
  });

  it("treats a value outside Google's enum as missing", () => {
    const { missing } = resolveApparelAttributes(
      mkProduct({
        attributes: {
          ...COMPLETE_ATTRIBUTES,
          ageGroup: "grown-ups",
          gender: "ladies",
        },
      }),
    );

    expect(missing).toEqual(["gender", "ageGroup"]);
  });

  it("treats blank and non-string values as missing", () => {
    const { missing } = resolveApparelAttributes(
      mkProduct({
        attributes: { ageGroup: null, color: "   ", gender: 1, size: [] },
      }),
    );

    expect(missing).toEqual(["color", "gender", "ageGroup", "size"]);
  });
});

describe("buildMerchantProductInput — incomplete apparel data", () => {
  const singleFieldCases: Array<{ field: string; omit: string }> = [
    { field: "color", omit: "color" },
    { field: "gender", omit: "gender" },
    { field: "ageGroup", omit: "ageGroup" },
    { field: "size", omit: "size" },
  ];

  for (const { field, omit } of singleFieldCases) {
    it(`raises a 422 listing ${field} when it is absent`, () => {
      const attributes: Record<string, unknown> = { ...COMPLETE_ATTRIBUTES };
      delete attributes[omit];

      let caught: unknown = null;
      try {
        build({ attributes });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(GoogleMerchantProductDataError);
      const error = caught as GoogleMerchantProductDataError;
      expect(error.status).toBe(422);
      expect(error.code).toBe("MERCHANT_PRODUCT_DATA_INCOMPLETE");
      expect(error.message).toBe(
        "The product is missing required Google Merchant attributes.",
      );
      expect(error.missingFields).toEqual([field]);
    });
  }

  it("lists every missing field when several are absent", () => {
    let caught: unknown = null;
    try {
      build({ attributes: { fabric: "Chiffon" } });
    } catch (error) {
      caught = error;
    }

    const error = caught as GoogleMerchantProductDataError;
    expect(error.missingFields).toEqual([
      "color",
      "gender",
      "ageGroup",
      "size",
    ]);
  });

  it("lists field names only — no row data, no credentials", () => {
    let caught: unknown = null;
    try {
      build({ attributes: {} });
    } catch (error) {
      caught = error;
    }

    const error = caught as GoogleMerchantProductDataError;
    const serialised = JSON.stringify({
      code: error.code,
      message: error.message,
      missingFields: error.missingFields,
    });

    expect(serialised).not.toContain(TEST_INSERT_PRODUCT_ID);
    expect(serialised).not.toContain("blob.vercel-storage");
    expect(serialised).not.toContain("pricePaise");
  });
});

// ---------------------------------------------------------------------------
// Exact submitted shape
// ---------------------------------------------------------------------------

describe("buildMerchantProductInput — submitted shape", () => {
  it("submits exactly the agreed attribute set", () => {
    expect(Object.keys(build().productAttributes).sort()).toEqual([
      "additionalImageLinks",
      "ageGroup",
      "availability",
      "canonicalLink",
      "color",
      "condition",
      "description",
      "gender",
      "identifierExists",
      "imageLink",
      "link",
      "material",
      "price",
      "size",
      "title",
    ]);
  });

  it("does not submit googleProductCategory (no reviewed category mapping exists)", () => {
    expect(
      Object.keys(build().productAttributes),
    ).not.toContain("googleProductCategory");
  });

  it("submits the top-level ProductInput fields only", () => {
    expect(Object.keys(build()).sort()).toEqual([
      "contentLanguage",
      "feedLabel",
      "offerId",
      "productAttributes",
    ]);
  });
});
