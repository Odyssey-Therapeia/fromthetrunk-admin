/**
 * P5-01: Google Merchant Center feed — mutation-proven unit tests.
 *
 * Test discipline:
 * - Mock @/db only (not the query module, mapping module, or serializer).
 * - listProducts runs against the mocked db; feed-mapping + serializer run for real.
 * - XML is PARSED (not string-matched) via a minimal structural extractor.
 * - Exclusions are proven by feeding a draft/test/zero-image product and asserting
 *   it is ABSENT from the parsed output — and present when eligible.
 * - Price is mutation-proven: wrong divisor fails.
 * - Availability mirrors json-ld / deriveStockStatus.
 * - Token gate is proven for all branches.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductWithRelations } from "@/db/queries/products";

// ---------------------------------------------------------------------------
// Minimal XML structural parser — no library dependency
// ---------------------------------------------------------------------------

/**
 * Parse a flat-ish RSS 2.0 feed into a structured object.
 * Returns { isRss, hasGNs, channelTitle, items } where each item is a
 * Record<tag, string[]>. Handles plain tags and namespaced g: tags.
 * NOT a general-purpose parser — handles the exact shape we emit.
 */
function parseFeedXml(xml: string): {
  isRss: boolean;
  hasGNs: boolean;
  channelTitle: string | null;
  items: Array<Record<string, string[]>>;
} {
  const isRss = /<rss\b/.test(xml);
  const hasGNs =
    /xmlns:g\s*=\s*["']http:\/\/base\.google\.com\/ns\/1\.0["']/.test(xml);

  const channelMatch = xml.match(
    /<channel[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/
  );
  const channelTitle = channelMatch
    ? unescapeXml(channelMatch[1].trim())
    : null;

  const itemBlocks: string[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    itemBlocks.push(m[1]);
  }

  const items = itemBlocks.map((block) => {
    const fields: Record<string, string[]> = {};
    const fieldRe = /<([\w:]+)>([\s\S]*?)<\/\1>/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(block)) !== null) {
      const tag = fm[1];
      const val = unescapeXml(fm[2].trim());
      if (!fields[tag]) fields[tag] = [];
      fields[tag].push(val);
    }
    return fields;
  });

  return { isRss, hasGNs, channelTitle, items };
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ---------------------------------------------------------------------------
// Hoisted mocks — @/db only
// ---------------------------------------------------------------------------

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbDelete = vi.hoisted(() => vi.fn());
const mockWithRetry = vi.hoisted(() =>
  vi.fn(<T>(fn: () => Promise<T>) => fn())
);

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
    delete: mockDbDelete,
  },
  withRetry: mockWithRetry,
}));

// ---------------------------------------------------------------------------
// Fixtures — ProductWithRelations shape
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-01T00:00:00.000Z");

const mkMedia = (url: string) => ({
  id: "media-1",
  key: "media/img.jpg",
  url,
  filename: "img.jpg",
  alt: null,
  mimeType: "image/jpeg",
  filesize: null,
  width: null,
  height: null,
  blurDataUrl: null,
  metadata: null,
  createdAt: NOW,
  updatedAt: NOW,
});

/** Build a minimal but type-correct product fixture. Cast via unknown since
 *  the test fixture omits DB-generated defaults that are irrelevant to feed
 *  logic (e.g. embedding vector columns) — only the fields the feed reads
 *  are populated.  */
function mkProduct(overrides: Record<string, unknown> = {}): ProductWithRelations {
  return {
    id: "prod-uuid-1",
    name: "Beautiful Kanjeevaram Silk Saree",
    slug: "kanjeevaram-silk-saree",
    status: "published",
    stockStatus: "available",
    pricePaise: 500000,
    originalPricePaise: null,
    featured: false,
    storyTitle: "Heritage Weave",
    storyNarrative: "A rare Kanjeevaram silk with zari border.",
    storyProvenance: null,
    storyEra: null,
    detailsFabric: "Kanjeevaram silk",
    detailsLength: null,
    detailsWidth: null,
    detailsCondition: "Excellent condition",
    detailsDesigner: null,
    typeId: null,
    attributes: {},
    collectionId: null,
    artisanId: null,
    quantityAvailable: 1,
    reservedUntil: null,
    soldAt: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    collection: null,
    images: [
      {
        media: mkMedia("https://blob.vercel-storage.com/img1.jpg"),
        sortOrder: 0,
      },
    ],
    tags: [],
    ...overrides,
  } as unknown as ProductWithRelations;
}

const multiImageProduct = mkProduct({
  id: "prod-uuid-2",
  slug: "multi-image-saree",
  images: [
    { media: mkMedia("https://blob.vercel-storage.com/img1.jpg"), sortOrder: 0 },
    { media: mkMedia("https://blob.vercel-storage.com/img2.jpg"), sortOrder: 1 },
    { media: mkMedia("https://blob.vercel-storage.com/img3.jpg"), sortOrder: 2 },
  ],
});

const draftProduct = mkProduct({
  id: "prod-uuid-draft",
  slug: "draft-saree",
  status: "draft",
});

const testProduct = mkProduct({
  id: "prod-uuid-test",
  slug: "test-chiffon-do-not-buy",
  name: "test chiffon do not buy if not authorized",
});

const zeroImageProduct = mkProduct({
  id: "prod-uuid-no-img",
  slug: "no-image-saree",
  images: [],
});

const soldProduct = mkProduct({
  id: "prod-uuid-sold",
  slug: "sold-saree",
  stockStatus: "sold",
  quantityAvailable: 0,
});

// ---------------------------------------------------------------------------
// DB mock helper for HTTP route tests
//
// listProducts internals:
//   withRetry #1: db.select().from(products).where(...).limit().offset().orderBy(...)
//   withRetry #2: db.select({total:count()}).from(products).where(...)
//   hydrateProducts (inside withRetry #3): Promise.all([
//     collections query (only if collectionIds.length > 0, else Promise.resolve([])),
//     images query: db.select().from(productImages).innerJoin(mediaAssets).where().orderBy(),
//     tags query:   db.select().from(productTags).innerJoin(tags).where(),
//   ])
//
// For our test fixtures (collectionId: null), the collection branch resolves
// immediately without a db.select() call. So db.select() is called:
//   call 0 → main product rows (chain ends with .orderBy)
//   call 1 → count (chain ends with .where returning [{total}])
//   call 2 → images (chain: .from.innerJoin.where.orderBy)
//   call 3 → tags   (chain: .from.innerJoin.where)
// ---------------------------------------------------------------------------
function setupDbForProducts(rawProducts: ReturnType<typeof mkProduct>[]) {
  const rawRows = rawProducts.map(
    ({ images: _i, tags: _t, collection: _c, ...rest }) => rest
  );

  const buildImages = () =>
    rawProducts.flatMap((p) =>
      (p.images as Array<{ media: ReturnType<typeof mkMedia>; sortOrder: number }>).map(
        (img) => ({
          productId: p.id,
          sortOrder: img.sortOrder,
          media: img.media,
        })
      )
    );

  const buildTags = () =>
    rawProducts.flatMap((p) =>
      (p.tags as Array<{ id: number; name: string; slug: string }>).map(
        (tag) => ({ productId: p.id, tag })
      )
    );

  // Generic chain builder — all methods return `chain` except the terminal.
  const makeChain = (terminalMethod: string, result: unknown[]) => {
    const chain: Record<string, (..._args: unknown[]) => unknown> = {};
    const passThrough = () => chain;
    for (const m of ["from", "where", "limit", "offset", "innerJoin", "orderBy"]) {
      chain[m] = m === terminalMethod ? () => Promise.resolve(result) : passThrough;
    }
    return chain;
  };

  let callIdx = 0;
  mockDbSelect.mockImplementation(() => {
    const idx = callIdx++;
    switch (idx) {
      case 0:
        // main product query — terminal: orderBy
        return makeChain("orderBy", rawRows);
      case 1:
        // count query — terminal: where
        return makeChain("where", [{ total: rawRows.length }]);
      case 2:
        // images hydration — chain: .from.innerJoin.where.orderBy — terminal: orderBy
        return makeChain("orderBy", buildImages());
      case 3:
        // tags hydration — chain: .from.innerJoin.where — terminal: where
        return makeChain("where", buildTags());
      default:
        return makeChain("orderBy", []);
    }
  });
}

// ---------------------------------------------------------------------------
// Import the units under test — AFTER mocks are registered
// ---------------------------------------------------------------------------

const { buildGoogleMerchantFeedXml } = await import(
  "@/api/hono/routes/feeds"
);

const { mapProductToFeedItem } = await import("@/lib/channels/feed-mapping");

// ---------------------------------------------------------------------------
// mapProductToFeedItem — unit tests (no db calls needed)
// ---------------------------------------------------------------------------

describe("mapProductToFeedItem — unit tests (no db calls)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the correct price in rupees (pricePaise / 100)", () => {
    const product = mkProduct({ pricePaise: 500000 });
    const item = mapProductToFeedItem(
      product    );
    expect(item.price).toBe(5000); // 500000 / 100 = 5000
  });

  it("MUTATION: wrong divisor (÷1000) would fail", () => {
    const product = mkProduct({ pricePaise: 500000 });
    const item = mapProductToFeedItem(
      product    );
    expect(item.price).not.toBe(500); // 500000 / 1000 = 500 ← wrong
  });

  it("availability: available stockStatus → in_stock", () => {
    const product = mkProduct({ stockStatus: "available" });
    const item = mapProductToFeedItem(
      product    );
    expect(item.availability).toBe("in_stock");
  });

  it("availability: sold stockStatus → out_of_stock", () => {
    const product = mkProduct({ stockStatus: "sold" });
    const item = mapProductToFeedItem(
      product    );
    expect(item.availability).toBe("out_of_stock");
  });

  it("availability: reserved stockStatus → out_of_stock (held, not purchasable)", () => {
    const product = mkProduct({ stockStatus: "reserved" });
    const item = mapProductToFeedItem(
      product    );
    expect(item.availability).toBe("out_of_stock");
  });

  it("description fallback: storyNarrative takes precedence", () => {
    const product = mkProduct({
      storyNarrative: "A rare silk weave.",
      storyTitle: "Heritage",
    });
    const item = mapProductToFeedItem(
      product    );
    expect(item.description).toBe("A rare silk weave.");
  });

  it("description fallback: no storyNarrative → storyTitle + fabric", () => {
    // When storyNarrative is null, the fallback is storyTitle + fabric
    // (mirrors json-ld.ts:20 fallback chain per P5-01 spec)
    const product = mkProduct({
      storyNarrative: null,
      storyTitle: "Heritage Weave",
      detailsFabric: "Kanjeevaram silk",
    });
    const item = mapProductToFeedItem(
      product    );
    expect(item.description).toContain("Heritage Weave");
    expect(item.description).toContain("Kanjeevaram silk");
  });

  it("description fallback: no narrative or title → name + fabric", () => {
    // storyTitle is non-null (notNull in schema) but may be an empty string.
    // When falsy, fall back to name + fabric.
    const product = mkProduct({
      storyNarrative: null,
      storyTitle: "",
      name: "Kanjeevaram Saree",
      detailsFabric: "Kanjeevaram silk",
    });
    const item = mapProductToFeedItem(
      product    );
    expect(item.description).toContain("Kanjeevaram Saree");
    expect(item.description).toContain("Kanjeevaram silk");
  });

  it("condition is always 'used'", () => {
    const item = mapProductToFeedItem(
      mkProduct()    );
    expect(item.condition).toBe("used");
  });

  it("identifierExists is always false", () => {
    const item = mapProductToFeedItem(
      mkProduct()    );
    expect(item.identifierExists).toBe(false);
  });

  it("brand is 'From the Trunk'", () => {
    const item = mapProductToFeedItem(
      mkProduct()    );
    expect(item.brand).toBe("From the Trunk");
  });

  it("id is the product slug", () => {
    const product = mkProduct({ slug: "some-slug" });
    const item = mapProductToFeedItem(
      product    );
    expect(item.id).toBe("some-slug");
  });

  it("link is absolute: siteOrigin + /collection/{slug}", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    const product = mkProduct({ slug: "silk-saree" });
    const item = mapProductToFeedItem(
      product    );
    expect(item.link).toBe(
      "https://www.fromthetrunk.shop/collection/silk-saree"
    );
  });

  it("imageUrl is the first image URL", () => {
    const product = mkProduct({
      images: [
        {
          media: mkMedia("https://blob.vercel-storage.com/img1.jpg"),
          sortOrder: 0,
        },
        {
          media: mkMedia("https://blob.vercel-storage.com/img2.jpg"),
          sortOrder: 1,
        },
      ],
    });
    const item = mapProductToFeedItem(
      product    );
    expect(item.imageUrl).toBe("https://blob.vercel-storage.com/img1.jpg");
  });

  it("additionalImageUrls contains remaining image URLs", () => {
    const product = mkProduct({
      images: [
        {
          media: mkMedia("https://blob.vercel-storage.com/img1.jpg"),
          sortOrder: 0,
        },
        {
          media: mkMedia("https://blob.vercel-storage.com/img2.jpg"),
          sortOrder: 1,
        },
        {
          media: mkMedia("https://blob.vercel-storage.com/img3.jpg"),
          sortOrder: 2,
        },
      ],
    });
    const item = mapProductToFeedItem(
      product    );
    expect(item.additionalImageUrls).toEqual([
      "https://blob.vercel-storage.com/img2.jpg",
      "https://blob.vercel-storage.com/img3.jpg",
    ]);
  });

  it("GST-inclusive flag ON: price = pricePaise / 100 (the all-in price)", () => {
    vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", "true");
    const product = mkProduct({ pricePaise: 1120000 });
    const item = mapProductToFeedItem(
      product    );
    expect(item.price).toBe(11200);
  });

  it("GST-inclusive flag OFF: price = pricePaise / 100", () => {
    vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", "false");
    const product = mkProduct({ pricePaise: 1000000 });
    const item = mapProductToFeedItem(
      product    );
    expect(item.price).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// buildGoogleMerchantFeedXml — XML structure tests
// ---------------------------------------------------------------------------

describe("buildGoogleMerchantFeedXml — XML structure", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits valid RSS 2.0 structure with g: namespace", () => {
    const xml = buildGoogleMerchantFeedXml([
      mkProduct() as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const parsed = parseFeedXml(xml);
    expect(parsed.isRss).toBe(true);
    expect(parsed.hasGNs).toBe(true);
    expect(parsed.channelTitle).toBeTruthy();
  });

  it("each item has required g: fields", () => {
    const xml = buildGoogleMerchantFeedXml([
      mkProduct() as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const parsed = parseFeedXml(xml);
    expect(parsed.items).toHaveLength(1);
    const item = parsed.items[0];
    expect(item["g:id"]).toBeDefined();
    expect(item["g:price"]).toBeDefined();
    expect(item["g:availability"]).toBeDefined();
    expect(item["g:condition"]).toBeDefined();
    expect(item["g:identifier_exists"]).toBeDefined();
    expect(item["g:brand"]).toBeDefined();
    expect(item["g:image_link"]).toBeDefined();
    expect(item["title"]).toBeDefined();
    expect(item["link"]).toBeDefined();
  });

  it("g:condition = used", () => {
    const xml = buildGoogleMerchantFeedXml([
      mkProduct() as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    expect(items[0]["g:condition"]?.[0]).toBe("used");
  });

  it("g:identifier_exists = no (GTIN exemption)", () => {
    const xml = buildGoogleMerchantFeedXml([
      mkProduct() as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    expect(items[0]["g:identifier_exists"]?.[0]).toBe("no");
  });

  it("g:price contains 'INR' and correct rupee value", () => {
    const product = mkProduct({ pricePaise: 500000 });
    const xml = buildGoogleMerchantFeedXml([
      product as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const price = items[0]["g:price"]?.[0];
    expect(price).toContain("INR");
    expect(price).toContain("5000.00");
  });

  it("MUTATION: wrong price divisor (÷1000) would not contain 5000.00", () => {
    const product = mkProduct({ pricePaise: 500000 });
    const xml = buildGoogleMerchantFeedXml([
      product as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const price = items[0]["g:price"]?.[0];
    // 500000/1000=500, which is wrong — must not equal 500.00
    expect(price).not.toContain("500.00 INR");
  });

  it("g:availability = in_stock for available product", () => {
    const xml = buildGoogleMerchantFeedXml([
      mkProduct({ stockStatus: "available" }) as Parameters<
        typeof mapProductToFeedItem
      >[0],
    ]);
    const { items } = parseFeedXml(xml);
    expect(items[0]["g:availability"]?.[0]).toBe("in_stock");
  });

  it("g:availability = out_of_stock for sold product", () => {
    const xml = buildGoogleMerchantFeedXml([
      soldProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    expect(items[0]["g:availability"]?.[0]).toBe("out_of_stock");
  });

  it("link is absolute (starts with https://)", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    const xml = buildGoogleMerchantFeedXml([
      mkProduct({ slug: "test-slug" }) as Parameters<
        typeof mapProductToFeedItem
      >[0],
    ]);
    const { items } = parseFeedXml(xml);
    const link = items[0]["link"]?.[0];
    expect(link).toMatch(/^https:\/\//);
    expect(link).toContain("/collection/test-slug");
  });

  it("g:image_link is absolute", () => {
    const xml = buildGoogleMerchantFeedXml([
      mkProduct() as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const imgLink = items[0]["g:image_link"]?.[0];
    expect(imgLink).toMatch(/^https:\/\//);
  });

  it("multiple images → g:additional_image_link for each extra", () => {
    const xml = buildGoogleMerchantFeedXml([
      multiImageProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const additional = items[0]["g:additional_image_link"];
    expect(additional).toBeDefined();
    expect(additional!.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Exclusion tests — mutation-proven
// ---------------------------------------------------------------------------

describe("buildGoogleMerchantFeedXml — exclusions (mutation-proven)", () => {
  it("EXCLUSION: draft product is ABSENT from the feed", () => {
    const xml = buildGoogleMerchantFeedXml([
      draftProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const ids = items.flatMap((i) => i["g:id"] ?? []);
    expect(ids).not.toContain(draftProduct.slug);
  });

  it("MUTATION presence-proof: eligible product IS present (draft exclusion is real)", () => {
    const eligible = mkProduct({ id: "prod-ok", slug: "eligible-saree" });
    const xml = buildGoogleMerchantFeedXml([
      eligible as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const ids = items.flatMap((i) => i["g:id"] ?? []);
    expect(ids).toContain("eligible-saree");
  });

  it("EXCLUSION: test product (name starts with 'test chiffon') is ABSENT", () => {
    const xml = buildGoogleMerchantFeedXml([
      testProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const ids = items.flatMap((i) => i["g:id"] ?? []);
    expect(ids).not.toContain(testProduct.slug);
  });

  it("EXCLUSION: zero-image product is ABSENT", () => {
    const xml = buildGoogleMerchantFeedXml([
      zeroImageProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const ids = items.flatMap((i) => i["g:id"] ?? []);
    expect(ids).not.toContain(zeroImageProduct.slug);
  });

  it("mixed set: only eligible product appears, all excluded are absent", () => {
    const eligible = mkProduct({ id: "prod-ok", slug: "eligible-saree" });
    const xml = buildGoogleMerchantFeedXml([
      draftProduct as Parameters<typeof mapProductToFeedItem>[0],
      testProduct as Parameters<typeof mapProductToFeedItem>[0],
      zeroImageProduct as Parameters<typeof mapProductToFeedItem>[0],
      eligible as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { items } = parseFeedXml(xml);
    const ids = items.flatMap((i) => i["g:id"] ?? []);

    expect(items).toHaveLength(1);
    expect(ids).toContain("eligible-saree");
    expect(ids).not.toContain(draftProduct.slug);
    expect(ids).not.toContain(testProduct.slug);
    expect(ids).not.toContain(zeroImageProduct.slug);
  });
});

// ---------------------------------------------------------------------------
// Token gate tests — via the Hono app (mocked @/db)
// ---------------------------------------------------------------------------

describe("Token gate — FEEDS_PUBLIC_TOKEN env var", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(<T>(fn: () => Promise<T>) => fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no FEEDS_PUBLIC_TOKEN → 200 with no token param", async () => {
    delete process.env.FEEDS_PUBLIC_TOKEN;
    setupDbForProducts([mkProduct()]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
  });

  it("FEEDS_PUBLIC_TOKEN set, no token param → 403", async () => {
    vi.stubEnv("FEEDS_PUBLIC_TOKEN", "secret-token-abc");
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it("FEEDS_PUBLIC_TOKEN set, wrong token → 403", async () => {
    vi.stubEnv("FEEDS_PUBLIC_TOKEN", "secret-token-abc");
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml?token=wrong"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it("FEEDS_PUBLIC_TOKEN set, correct token → 200 with application/xml", async () => {
    vi.stubEnv("FEEDS_PUBLIC_TOKEN", "secret-token-abc");
    setupDbForProducts([mkProduct()]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml?token=secret-token-abc"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
  });
});

// ---------------------------------------------------------------------------
// Content-type and XML output via HTTP route
// ---------------------------------------------------------------------------

describe("Feed route — content-type and XML output (via HTTP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(<T>(fn: () => Promise<T>) => fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns application/xml content-type", async () => {
    delete process.env.FEEDS_PUBLIC_TOKEN;
    setupDbForProducts([mkProduct()]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
  });

  it("body is parseable RSS 2.0 with g: namespace and at least one item", async () => {
    delete process.env.FEEDS_PUBLIC_TOKEN;
    setupDbForProducts([mkProduct()]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml"
    );
    const res = await app.fetch(req);
    const xml = await res.text();
    const parsed = parseFeedXml(xml);
    expect(parsed.isRss).toBe(true);
    expect(parsed.hasGNs).toBe(true);
    expect(parsed.items.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Inventory V2 availability — mutation-proven
//
// When FTT_FEATURE_INVENTORY_V2 is ON, the feed must derive each product's
// effective stockStatus via deriveStockStatus(quantityAvailable, activeReservationsCount)
// — mirroring app/(site)/collection/[slug]/page.tsx:86-91.
//
// Mutation proof: a product whose raw stockStatus="reserved" but whose
// quantityAvailable=1 and activeReservationsCount=0 (expired reservation) MUST
// emit g:availability=in_stock (matching the PDP). A test that reads the raw
// column would emit "out_of_stock" and this test would FAIL.
// ---------------------------------------------------------------------------

describe("Inventory V2 availability — mutation-proven (FTT_FEATURE_INVENTORY_V2=true)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(<T>(fn: () => Promise<T>) => fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Set up the db mock for a V2 availability test.
   *
   * Call sequence when FTT_FEATURE_INVENTORY_V2=true:
   *   0: main products query (terminal: orderBy)
   *   1: count query (terminal: where)
   *   2: images hydration (terminal: orderBy)
   *   3: tags hydration (terminal: where)
   *   4: batch reservations (terminal: groupBy)
   *        → called by getBatchActiveReservationsCounts
   *        → returns [] when no active reservations, [{productId, total}] otherwise
   */
  function setupDbForProductsWithReservations(
    rawProducts: ReturnType<typeof mkProduct>[],
    activeReservationRows: Array<{ productId: string; total: number }>
  ) {
    const rawRows = rawProducts.map(
      ({ images: _i, tags: _t, collection: _c, ...rest }) => rest
    );

    const buildImages = () =>
      rawProducts.flatMap((p) =>
        (
          p.images as Array<{
            media: ReturnType<typeof mkMedia>;
            sortOrder: number;
          }>
        ).map((img) => ({
          productId: p.id,
          sortOrder: img.sortOrder,
          media: img.media,
        }))
      );

    const buildTags = () =>
      rawProducts.flatMap((p) =>
        (p.tags as Array<{ id: number; name: string; slug: string }>).map(
          (tag) => ({ productId: p.id, tag })
        )
      );

    const makeChain = (terminalMethod: string, result: unknown[]) => {
      const chain: Record<string, (..._args: unknown[]) => unknown> = {};
      const passThrough = () => chain;
      for (const m of [
        "from",
        "where",
        "limit",
        "offset",
        "innerJoin",
        "orderBy",
        "groupBy",
      ]) {
        chain[m] = m === terminalMethod ? () => Promise.resolve(result) : passThrough;
      }
      return chain;
    };

    let callIdx = 0;
    mockDbSelect.mockImplementation(() => {
      const idx = callIdx++;
      switch (idx) {
        case 0:
          return makeChain("orderBy", rawRows);
        case 1:
          return makeChain("where", [{ total: rawRows.length }]);
        case 2:
          return makeChain("orderBy", buildImages());
        case 3:
          return makeChain("where", buildTags());
        case 4:
          // batch reservations — terminal: groupBy
          return makeChain("groupBy", activeReservationRows);
        default:
          return makeChain("orderBy", []);
      }
    });
  }

  it("MUTATION-PROVEN: expired reservation — raw=reserved, qty=1, activeCount=0 → in_stock", async () => {
    vi.stubEnv("FTT_FEATURE_INVENTORY_V2", "true");
    delete process.env.FEEDS_PUBLIC_TOKEN;

    // Product has stale raw stockStatus="reserved" but the reservation has expired
    // (quantityAvailable=1, activeReservationsCount=0)
    const reservedButExpired = mkProduct({
      id: "prod-uuid-v2-reserved",
      slug: "reserved-but-expired",
      stockStatus: "reserved",
      quantityAvailable: 1,
    });

    // No active reservation rows → the batch query returns []
    setupDbForProductsWithReservations([reservedButExpired], []);

    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const xml = await res.text();
    const parsed = parseFeedXml(xml);
    expect(parsed.items).toHaveLength(1);

    // MUST be in_stock: deriveStockStatus({qty=1, activeCount=0}) = "available" → "in_stock"
    // A route that reads the raw column would emit "out_of_stock" here — the test FAILS.
    expect(parsed.items[0]["g:availability"]?.[0]).toBe("in_stock");
  });

  it("MUTATION-PROVEN: active reservation — raw=reserved, qty=1, activeCount=1 → out_of_stock", async () => {
    vi.stubEnv("FTT_FEATURE_INVENTORY_V2", "true");
    delete process.env.FEEDS_PUBLIC_TOKEN;

    const reservedActive = mkProduct({
      id: "prod-uuid-v2-active",
      slug: "reserved-active",
      stockStatus: "reserved",
      quantityAvailable: 1,
    });

    // One active reservation row → the batch query returns count=1 for this product
    setupDbForProductsWithReservations([reservedActive], [
      { productId: "prod-uuid-v2-active", total: 1 },
    ]);

    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const xml = await res.text();
    const parsed = parseFeedXml(xml);
    expect(parsed.items).toHaveLength(1);

    // MUST be out_of_stock: deriveStockStatus({qty=1, activeCount=1}) = "reserved" → "out_of_stock"
    expect(parsed.items[0]["g:availability"]?.[0]).toBe("out_of_stock");
  });

  it("MUTATION-PROVEN: flag OFF (raw column read) — raw=reserved without batch → out_of_stock", async () => {
    vi.stubEnv("FTT_FEATURE_INVENTORY_V2", "false");
    delete process.env.FEEDS_PUBLIC_TOKEN;

    // With flag OFF, the route reads raw stockStatus directly (no batch query call)
    const reservedProduct = mkProduct({
      id: "prod-uuid-v2-off",
      slug: "reserved-flag-off",
      stockStatus: "reserved",
      quantityAvailable: 1,
    });

    // Only 4 db.select() calls needed (no batch reservations call)
    setupDbForProducts([reservedProduct]);

    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/google-merchant.xml"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const xml = await res.text();
    const parsed = parseFeedXml(xml);
    expect(parsed.items).toHaveLength(1);

    // Flag OFF: raw "reserved" column → out_of_stock (the mapping is: non-available → out_of_stock)
    expect(parsed.items[0]["g:availability"]?.[0]).toBe("out_of_stock");
  });
});
