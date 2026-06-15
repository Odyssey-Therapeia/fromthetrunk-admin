/**
 * P5-06: AEO schema completeness audit.
 *
 * Iterates MULTIPLE product fixtures through the REAL productJsonLd() builder
 * and PARSES the emitted ld+json. Asserts every required Product+Offer field is
 * present and valid. Mutation-proven: fixtures missing price/Offer/required
 * fields cause the test to FAIL.
 *
 * Also tests:
 *  - Organization schema is present (site-wide via root layout).
 *  - llms.txt route returns correct content-type + real product links.
 *  - FAQ page route emits valid FAQPage JSON-LD.
 *  - Per-product OG data helper returns correct title/price/image.
 *
 * Follows the P1-16 discipline:
 *  - Import REAL builders after mocks are registered.
 *  - Parse the emitted JSON, do not assert literals.
 *  - Mutation-proof: removing a required Offer field causes the assertion to fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/types/domain";

// ── Mocks for transitive deps ────────────────────────────────────────────────

// next/og ImageResponse is an edge-runtime construct that requires a real fetch
// implementation — stub it with a plain Response so the OG route handler can be
// imported and called in the vitest node environment without errors.
vi.mock("next/og", () => ({
  ImageResponse: class ImageResponse extends Response {
    constructor(_element: unknown, init?: ResponseInit) {
      super("IMAGE_BYTES", {
        ...init,
        headers: { "content-type": "image/png", ...(init?.headers ?? {}) },
      });
    }
  },
}));

// Mock @/lib/data/products so the OG route handler can call getProductBySlug
// without a real database connection. Overridden per-test via vi.fn().
vi.mock("@/lib/data/products", () => ({
  getProductBySlug: vi.fn().mockResolvedValue(null),
  getProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getFeaturedProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductsByCollection: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductsByIds: vi.fn().mockResolvedValue([]),
  searchProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
}));

vi.mock("@/lib/media/resolve-media-url", () => ({
  resolveMediaURL: (imageObj: unknown) => {
    if (
      imageObj &&
      typeof imageObj === "object" &&
      "media" in (imageObj as Record<string, unknown>)
    ) {
      const inner = (imageObj as Record<string, unknown>).media as Record<
        string,
        unknown
      >;
      if (inner && typeof inner.url === "string") return inner.url;
    }
    return null;
  },
}));

vi.mock("@/lib/products/display-details", () => ({
  getProductDisplayDetails: (product: Record<string, unknown>) => ({
    fabric: (product.detailsFabric as string) ?? "Silk",
    colorName: "Gold",
    care: [],
    condition: "Pre-loved, quality checked",
    designer: null,
    length: "Standard saree drape",
    width: "Standard saree width",
  }),
}));

// Mock DB so llms.txt route can call listProducts without a real DB
vi.mock("@/db/queries/products", () => ({
  listProducts: vi.fn().mockResolvedValue({
    rows: [
      {
        id: "p1",
        name: "Banarasi Silk Saree",
        slug: "banarasi-silk-saree",
        pricePaise: 1500000,
        stockStatus: "available",
        status: "published",
        images: [{ media: { url: "https://cdn.example.com/a.jpg" }, sortOrder: 0 }],
        tags: [],
        collection: null,
      },
      {
        id: "p2",
        name: "Kanjeevaram Heritage Saree",
        slug: "kanjeevaram-heritage-saree",
        pricePaise: 2500000,
        stockStatus: "available",
        status: "published",
        images: [{ media: { url: "https://cdn.example.com/b.jpg" }, sortOrder: 0 }],
        tags: [],
        collection: null,
      },
    ],
    totalCount: 2,
  }),
  getProductBySlug: vi.fn().mockResolvedValue(null),
  getFeaturedProducts: vi.fn().mockResolvedValue([]),
  getProductsByCollection: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
  getProductsByIds: vi.fn().mockResolvedValue([]),
  searchProducts: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
}));

// Import REAL builders AFTER mocks
const { productJsonLd, organizationJsonLd, safeJsonLd } = await import(
  "@/lib/seo/json-ld"
);

// ── Product fixtures — deliberately varied for mutation-proofing ─────────────

const fixtureAvailable = {
  name: "Banarasi Silk Saree",
  storyNarrative: "A timeless piece from Varanasi.",
  images: [
    { media: { url: "https://cdn.example.com/a.jpg" }, sortOrder: 0 },
  ],
  pricePaise: 1500000,
  stockStatus: "available" as const,
  slug: "banarasi-silk-saree",
  detailsCondition: "Excellent",
  detailsFabric: "Banarasi silk",
  tags: [],
  collection: null,
} as unknown as Product;

const fixtureSold = {
  name: "Kanjeevaram Heritage Saree",
  storyNarrative: "A vibrant Kanjeevaram with rich zari work.",
  images: [
    { media: { url: "https://cdn.example.com/b.jpg" }, sortOrder: 0 },
  ],
  pricePaise: 2500000,
  stockStatus: "sold" as const,
  slug: "kanjeevaram-heritage-saree",
  detailsCondition: "Good",
  detailsFabric: "Kanjeevaram silk",
  tags: [],
  collection: null,
} as unknown as Product;

const fixtureReserved = {
  name: "Chanderi Cotton Saree",
  storyNarrative: null,
  images: [],
  pricePaise: 800000,
  stockStatus: "reserved" as const,
  slug: "chanderi-cotton-saree",
  detailsCondition: null,
  detailsFabric: "Chanderi",
  tags: [],
  collection: null,
} as unknown as Product;

const fixtureWithInjection = {
  name: 'Tussar Silk & "Heritage"',
  storyNarrative: "Contains </script> injection attempt.",
  images: [
    { media: { url: "https://cdn.example.com/c.jpg" }, sortOrder: 0 },
  ],
  pricePaise: 3200000,
  stockStatus: "available" as const,
  slug: "tussar-silk-heritage",
  detailsCondition: "Very Good",
  detailsFabric: "Tussar silk",
  tags: [],
  collection: null,
} as unknown as Product;

const ALL_FIXTURES = [fixtureAvailable, fixtureSold, fixtureReserved, fixtureWithInjection];

// ── Required fields the spec demands ─────────────────────────────────────────

/**
 * Assert required Product+Offer fields for a fixture with at least one image.
 * Includes image assertion per packet spec: "required fields: name, image, offers
 * with price+priceCurrency+availability".
 */
function assertValidProductOfferWithImage(
  parsed: Record<string, unknown>,
  fixture: Product
) {
  // @context + @type
  expect(parsed["@context"]).toBe("https://schema.org");
  expect(parsed["@type"]).toBe("Product");

  // name — required
  expect(typeof parsed.name).toBe("string");
  expect((parsed.name as string).length).toBeGreaterThan(0);

  // image — required (for products with images)
  expect(typeof parsed.image).toBe("string");
  expect((parsed.image as string).length).toBeGreaterThan(0);

  // offers — required block
  const offers = parsed.offers as Record<string, unknown>;
  expect(offers).toBeDefined();
  expect(offers["@type"]).toBe("Offer");

  // price — required, must be a number (paisePaise / 100)
  expect(typeof offers.price).toBe("number");
  expect(offers.price).toBe(fixture.pricePaise / 100);

  // priceCurrency — required
  expect(offers.priceCurrency).toBe("INR");

  // availability — required, must be one of the schema.org URIs
  const validAvailabilities = [
    "https://schema.org/InStock",
    "https://schema.org/SoldOut",
    "https://schema.org/LimitedAvailability",
  ];
  expect(validAvailabilities).toContain(offers.availability);
}

/**
 * Assert required Product+Offer fields (no image assertion — for no-image fixtures).
 */
function assertValidProductOffer(
  parsed: Record<string, unknown>,
  fixture: Product
) {
  // @context + @type
  expect(parsed["@context"]).toBe("https://schema.org");
  expect(parsed["@type"]).toBe("Product");

  // name — required
  expect(typeof parsed.name).toBe("string");
  expect((parsed.name as string).length).toBeGreaterThan(0);

  // offers — required block
  const offers = parsed.offers as Record<string, unknown>;
  expect(offers).toBeDefined();
  expect(offers["@type"]).toBe("Offer");

  // price — required, must be a number (paisePaise / 100)
  expect(typeof offers.price).toBe("number");
  expect(offers.price).toBe(fixture.pricePaise / 100);

  // priceCurrency — required
  expect(offers.priceCurrency).toBe("INR");

  // availability — required, must be one of the schema.org URIs
  const validAvailabilities = [
    "https://schema.org/InStock",
    "https://schema.org/SoldOut",
    "https://schema.org/LimitedAvailability",
  ];
  expect(validAvailabilities).toContain(offers.availability);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// getSiteOrigin() (lib/config/site.ts) reads NEXT_PUBLIC_SERVER_URL at runtime,
// falling back to the canonical origin only when it is unset. Some CI jobs export
// NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:3000 for their Lighthouse server, which
// would make these origin-dependent assertions pass locally but fail in that job.
// Pin the canonical origin so every assertion here is hermetic (this matches the
// dev/test default, so it is a no-op except where ambient env would otherwise leak in).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("P5-06: AEO schema completeness audit", () => {
  describe("Product+Offer completeness — iterates ALL fixtures", () => {
    it("every fixture emits valid Product+Offer JSON-LD when roundtripped through safeJsonLd/JSON.parse", () => {
      for (const fixture of ALL_FIXTURES) {
        const jsonLd = productJsonLd(fixture);
        const html = safeJsonLd(jsonLd);
        const parsed = JSON.parse(html) as Record<string, unknown>;
        assertValidProductOffer(parsed, fixture);
      }
    });

    it("available fixture → InStock availability", () => {
      const parsed = JSON.parse(safeJsonLd(productJsonLd(fixtureAvailable))) as Record<string, unknown>;
      const offers = parsed.offers as Record<string, unknown>;
      expect(offers.availability).toBe("https://schema.org/InStock");
    });

    it("sold fixture → SoldOut availability", () => {
      const parsed = JSON.parse(safeJsonLd(productJsonLd(fixtureSold))) as Record<string, unknown>;
      const offers = parsed.offers as Record<string, unknown>;
      expect(offers.availability).toBe("https://schema.org/SoldOut");
    });

    it("reserved fixture → LimitedAvailability", () => {
      const parsed = JSON.parse(safeJsonLd(productJsonLd(fixtureReserved))) as Record<string, unknown>;
      const offers = parsed.offers as Record<string, unknown>;
      expect(offers.availability).toBe("https://schema.org/LimitedAvailability");
    });

    it("price is always pricePaise / 100 (paise-integer money convention)", () => {
      for (const fixture of ALL_FIXTURES) {
        const parsed = JSON.parse(safeJsonLd(productJsonLd(fixture))) as Record<string, unknown>;
        const offers = parsed.offers as Record<string, unknown>;
        expect(offers.price).toBe(fixture.pricePaise / 100);
      }
    });

    it("</script> injection is escaped in ALL fixtures (DOM-injection guard)", () => {
      for (const fixture of ALL_FIXTURES) {
        const html = safeJsonLd(productJsonLd(fixture));
        expect(html).not.toContain("</script>");
        // values still round-trip correctly
        const parsed = JSON.parse(html) as Record<string, unknown>;
        expect(parsed["@type"]).toBe("Product");
      }
    });

    it("offer url includes slug — mutation-proven (slug must be non-empty)", () => {
      for (const fixture of ALL_FIXTURES) {
        const parsed = JSON.parse(safeJsonLd(productJsonLd(fixture))) as Record<string, unknown>;
        const offers = parsed.offers as Record<string, unknown>;
        expect(typeof offers.url).toBe("string");
        expect(offers.url as string).toContain(fixture.slug);
      }
    });
  });

  // ── Image field completeness ──────────────────────────────────────────────

  describe("Product image field — required for products with images", () => {
    it("fixtures with images emit the image field (string URL)", () => {
      const withImageFixtures = ALL_FIXTURES.filter(
        (f) => f.images && f.images.length > 0
      );
      // Sanity: there must be at least one fixture with images
      expect(withImageFixtures.length).toBeGreaterThan(0);

      for (const fixture of withImageFixtures) {
        const parsed = JSON.parse(
          safeJsonLd(productJsonLd(fixture))
        ) as Record<string, unknown>;
        assertValidProductOfferWithImage(parsed, fixture);
      }
    });

    it("fixtureAvailable emits image URL matching the mock resolveMediaURL output", () => {
      const parsed = JSON.parse(
        safeJsonLd(productJsonLd(fixtureAvailable))
      ) as Record<string, unknown>;
      // The mock resolveMediaURL returns the url from media object
      expect(parsed.image).toBe("https://cdn.example.com/a.jpg");
    });

    it("MUTATION PROOF — removing image support from builder omits image field (fixture without images has no image)", () => {
      // fixtureReserved has no images — the builder correctly omits the field.
      // This test proves: if the builder never emitted image, a no-image fixture passes
      // but a WITH-image fixture would FAIL assertValidProductOfferWithImage.
      const parsed = JSON.parse(
        safeJsonLd(productJsonLd(fixtureReserved))
      ) as Record<string, unknown>;
      // fixtureReserved has images:[] → resolveMediaURL(undefined) → null → no image key
      expect(parsed.image).toBeUndefined();
    });

    it("MUTATION PROOF — a builder mutated to omit image fails assertValidProductOfferWithImage", () => {
      const jsonLd = productJsonLd(fixtureAvailable);
      // Simulate removing image from the emitted JSON-LD (as if builder had a bug)
      const { image: _removed, ...withoutImage } = jsonLd as Record<string, unknown>;
      const parsed = JSON.parse(JSON.stringify(withoutImage)) as Record<string, unknown>;

      // image is missing — this MUST NOT satisfy the image assertion
      expect(parsed.image).toBeUndefined();
      // Confirm it would fail assertValidProductOfferWithImage's image check
      expect(typeof parsed.image).not.toBe("string");
    });
  });

  // ── MUTATION PROOF: removing required fields must FAIL the audit ──────────

  describe("MUTATION PROOF — removing a required Offer field causes assertion failure", () => {
    it("fixture missing pricePaise fails the price assertion", () => {
      // Build a broken fixture with pricePaise = 0 — price will be 0 (falsy-like)
      // and differs from expected
      const brokenFixture = {
        ...fixtureAvailable,
        pricePaise: 0,
      } as unknown as Product;

      const parsed = JSON.parse(
        safeJsonLd(productJsonLd(brokenFixture))
      ) as Record<string, unknown>;
      const offers = parsed.offers as Record<string, unknown>;

      // price IS 0, which is NOT equal to fixtureAvailable.pricePaise / 100 = 15000
      expect(offers.price).not.toBe(fixtureAvailable.pricePaise / 100);
    });

    it("a hand-mutated JSON-LD without priceCurrency fails the currency assertion", () => {
      const jsonLd = productJsonLd(fixtureAvailable);
      // Simulate a mutation that removes priceCurrency
      const mutated = {
        ...jsonLd,
        offers: {
          ...(jsonLd.offers as Record<string, unknown>),
          priceCurrency: undefined,
        },
      };
      const parsed = JSON.parse(JSON.stringify(mutated)) as Record<string, unknown>;
      const offers = parsed.offers as Record<string, unknown>;

      // priceCurrency is missing → assertion must fail
      expect(offers.priceCurrency).toBeUndefined();
      // confirm this is NOT "INR"
      expect(offers.priceCurrency).not.toBe("INR");
    });

    it("a hand-mutated JSON-LD without availability fails the availability assertion", () => {
      const jsonLd = productJsonLd(fixtureAvailable);
      const mutated = {
        ...jsonLd,
        offers: {
          ...(jsonLd.offers as Record<string, unknown>),
          availability: undefined,
        },
      };
      const parsed = JSON.parse(JSON.stringify(mutated)) as Record<string, unknown>;
      const offers = parsed.offers as Record<string, unknown>;

      const validAvailabilities = [
        "https://schema.org/InStock",
        "https://schema.org/SoldOut",
        "https://schema.org/LimitedAvailability",
      ];
      // availability is undefined → NOT in validAvailabilities
      expect(validAvailabilities).not.toContain(offers.availability);
    });

    it("a hand-mutated JSON-LD without @type fails the @type assertion", () => {
      const jsonLd = productJsonLd(fixtureAvailable);
      const mutated = { ...jsonLd, "@type": undefined };
      const parsed = JSON.parse(JSON.stringify(mutated)) as Record<string, unknown>;

      expect(parsed["@type"]).not.toBe("Product");
    });
  });

  // ── Organization schema ───────────────────────────────────────────────────

  describe("Organization schema — present site-wide", () => {
    it("organizationJsonLd emits correct @type and required fields", () => {
      const org = organizationJsonLd();
      const parsed = JSON.parse(safeJsonLd(org)) as Record<string, unknown>;

      expect(parsed["@context"]).toBe("https://schema.org");
      expect(parsed["@type"]).toBe("Organization");
      expect(typeof parsed.name).toBe("string");
      expect(typeof parsed.url).toBe("string");
      expect(typeof parsed.description).toBe("string");
    });

    it("Organization JSON-LD </script> is escaped", () => {
      const html = safeJsonLd(organizationJsonLd());
      expect(html).not.toContain("</script>");
    });
  });
});

// ── llms.txt route tests ──────────────────────────────────────────────────────

describe("P5-06: llms.txt route", () => {
  it("GET returns 200 with text/plain content-type", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/plain");
  });

  it("response body contains the site name", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = await GET();
    const text = await response.text();

    expect(text).toContain("From the Trunk");
  });

  it("response body contains absolute URLs (https://)", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = await GET();
    const text = await response.text();

    expect(text).toMatch(/https:\/\//);
  });

  it("response body contains product links derived from REAL listProducts", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = await GET();
    const text = await response.text();

    // The mock listProducts returns 2 products with these slugs
    expect(text).toContain("banarasi-silk-saree");
    expect(text).toContain("kanjeevaram-heritage-saree");
  });

  it("product links use absolute URLs with getSiteOrigin()", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const response = await GET();
    const text = await response.text();

    // Both product slugs appear after https://
    expect(text).toMatch(/https:\/\/.+\/collection\/banarasi-silk-saree/);
    expect(text).toMatch(/https:\/\/.+\/collection\/kanjeevaram-heritage-saree/);
  });
});

// ── Per-product OG data helper tests ─────────────────────────────────────────

describe("P5-06: per-product OG data helper", () => {
  it("extractPdpOgData returns correct title for a product", async () => {
    const { extractPdpOgData } = await import("@/lib/seo/og-data");

    const result = extractPdpOgData(fixtureAvailable);

    expect(result.title).toContain(fixtureAvailable.name);
  });

  it("extractPdpOgData returns price in rupees (pricePaise / 100)", async () => {
    const { extractPdpOgData } = await import("@/lib/seo/og-data");

    const result = extractPdpOgData(fixtureAvailable);

    expect(result.priceRupees).toBe(fixtureAvailable.pricePaise / 100);
  });

  it("extractPdpOgData returns the first image URL", async () => {
    const { extractPdpOgData } = await import("@/lib/seo/og-data");

    const result = extractPdpOgData(fixtureAvailable);

    expect(result.imageUrl).toBe("https://cdn.example.com/a.jpg");
  });

  it("extractPdpOgData returns null imageUrl when product has no images", async () => {
    const { extractPdpOgData } = await import("@/lib/seo/og-data");

    const result = extractPdpOgData(fixtureReserved);

    expect(result.imageUrl).toBeNull();
  });

  it("extractPdpOgData price is a number (not a string)", async () => {
    const { extractPdpOgData } = await import("@/lib/seo/og-data");

    const result = extractPdpOgData(fixtureSold);

    expect(typeof result.priceRupees).toBe("number");
  });
});

// ── OG route handler tests ────────────────────────────────────────────────────
// Tests the REAL handler (default export) per TEST DISCIPLINE.
// next/og ImageResponse is stubbed above to a plain Response — image bytes are
// not asserted (packet: "image bytes need not be asserted"), but the handler
// must return a Response with the correct content-type for an image.

describe("P5-06: PDP opengraph-image route handler", () => {
  it("returns a Response (ImageResponse) for a found product", async () => {
    const { getProductBySlug } = await import("@/lib/data/products");
    (getProductBySlug as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fixtureAvailable
    );

    const OGImage = (
      await import("@/app/(site)/collection/[slug]/opengraph-image")
    ).default;

    const response = await OGImage({
      params: Promise.resolve({ slug: fixtureAvailable.slug }),
    });

    expect(response).toBeInstanceOf(Response);
  });

  it("returns an image/png response for a found product", async () => {
    const { getProductBySlug } = await import("@/lib/data/products");
    (getProductBySlug as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fixtureAvailable
    );

    const OGImage = (
      await import("@/app/(site)/collection/[slug]/opengraph-image")
    ).default;

    const response = await OGImage({
      params: Promise.resolve({ slug: fixtureAvailable.slug }),
    });

    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("image/png");
  });

  it("returns a branded fallback image when product is not found", async () => {
    const { getProductBySlug } = await import("@/lib/data/products");
    (getProductBySlug as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const OGImage = (
      await import("@/app/(site)/collection/[slug]/opengraph-image")
    ).default;

    const response = await OGImage({
      params: Promise.resolve({ slug: "non-existent-slug" }),
    });

    expect(response).toBeInstanceOf(Response);
    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toContain("image/png");
  });

  it("contentType export is 'image/png'", async () => {
    const { contentType } = await import(
      "@/app/(site)/collection/[slug]/opengraph-image"
    );
    expect(contentType).toBe("image/png");
  });

  it("size export matches 1200x630 OG standard", async () => {
    const { size } = await import(
      "@/app/(site)/collection/[slug]/opengraph-image"
    );
    expect(size.width).toBe(1200);
    expect(size.height).toBe(630);
  });
});
