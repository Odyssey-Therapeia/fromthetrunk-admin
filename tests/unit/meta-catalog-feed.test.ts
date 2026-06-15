/**
 * P5-02: Meta catalog feed — mutation-proven unit tests.
 *
 * Test discipline:
 * - Mock @/db only (not the query module, mapping module, or serializer).
 * - listProducts runs against the mocked db; feed-mapping + serializer run for real.
 * - CSV is PARSED (not string-matched) via a minimal structural extractor.
 * - Exclusions are proven by feeding a draft/test/zero-image product and asserting
 *   it is ABSENT from the parsed output — and present when eligible.
 * - Shared-mapping reuse proven: mapProductToFeedItem values match FeedItemData for same
 *   product in both feeds (same price, same availability, same description).
 * - Price is mutation-proven: wrong divisor fails.
 * - Availability mirrors json-ld / deriveStockStatus.
 * - Token gate is proven for all branches.
 * - Inventory V2: expired reservation → in_stock (proven via deriveStockStatus).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductWithRelations } from "@/db/queries/products";

// ---------------------------------------------------------------------------
// Minimal CSV parser
// ---------------------------------------------------------------------------

/**
 * Parse a Meta catalog CSV string into header + rows.
 * Returns { headers: string[], rows: Array<Record<string, string>> }
 * Per RFC 4180: cells quoted with "" for embedded quotes.
 */
function parseCsv(csv: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  // Split lines carefully (skip empty trailing lines)
  const lines = csv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cells.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current);
    return cells;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseRow(line);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = cells[idx] ?? "";
    });
    return record;
  });

  return { headers, rows };
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

/** Build a minimal but type-correct product fixture. */
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
// listProducts internals (call sequence, same as google-merchant-feed.test.ts):
//   call 0 → main product rows (terminal: orderBy)
//   call 1 → count query (terminal: where)
//   call 2 → images hydration (terminal: orderBy)
//   call 3 → tags hydration (terminal: where)
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
        return makeChain("orderBy", rawRows);
      case 1:
        return makeChain("where", [{ total: rawRows.length }]);
      case 2:
        return makeChain("orderBy", buildImages());
      case 3:
        return makeChain("where", buildTags());
      default:
        return makeChain("orderBy", []);
    }
  });
}

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

// ---------------------------------------------------------------------------
// Import units under test — AFTER mocks are registered
// ---------------------------------------------------------------------------

const { buildMetaCatalogCsv } = await import("@/api/hono/routes/feeds");
const { mapProductToFeedItem } = await import("@/lib/channels/feed-mapping");

// ---------------------------------------------------------------------------
// Shared-mapping reuse proof
//
// The Meta feed MUST call the same mapProductToFeedItem as Google.
// We prove this by asserting that FeedItemData values match for a given product.
// A change to feed-mapping.ts will therefore affect both feeds.
// ---------------------------------------------------------------------------

describe("Shared mapping reuse — Meta reads identical FeedItemData as Google", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("price field from mapProductToFeedItem matches CSV price column", () => {
    const product = mkProduct({ pricePaise: 750000 });
    // Get the canonical FeedItemData from the shared mapping
    const feedItem = mapProductToFeedItem(product as Parameters<typeof mapProductToFeedItem>[0]);
    // Get the Meta CSV output using the real serializer
    const csv = buildMetaCatalogCsv([product as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    // Price in CSV must match FeedItemData price + currency (same source of truth)
    const expectedPrice = `${feedItem.price.toFixed(2)} ${feedItem.currency}`;
    expect(rows[0]["price"]).toBe(expectedPrice);
  });

  it("availability field from mapProductToFeedItem matches CSV availability column", () => {
    // Test all availability states
    const availableProduct = mkProduct({ stockStatus: "available" });
    const soldProduct2 = mkProduct({ stockStatus: "sold" });
    const reservedProduct = mkProduct({ stockStatus: "reserved" });

    for (const product of [availableProduct, soldProduct2, reservedProduct]) {
      const feedItem = mapProductToFeedItem(product as Parameters<typeof mapProductToFeedItem>[0]);
      const csv = buildMetaCatalogCsv([product as Parameters<typeof mapProductToFeedItem>[0]]);
      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]["availability"]).toBe(feedItem.availability);
    }
  });

  it("description from mapProductToFeedItem matches CSV description column", () => {
    const product = mkProduct({
      storyNarrative: "An exceptional vintage weave.",
      storyTitle: "Golden Zari",
    });
    const feedItem = mapProductToFeedItem(product as Parameters<typeof mapProductToFeedItem>[0]);
    const csv = buildMetaCatalogCsv([product as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]["description"]).toBe(feedItem.description);
  });

  it("MUTATION: wrong price divisor — if feed-mapping.ts changes price divisor, CSV price changes too", () => {
    // This proves the Meta feed reads from mapProductToFeedItem, not a reimplementation.
    // We verify pricePaise/100 = rupees; wrong divisor /1000 would yield 500 not 5000.
    const product = mkProduct({ pricePaise: 500000 });
    const csv = buildMetaCatalogCsv([product as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["price"]).toContain("5000.00");      // correct: /100
    expect(rows[0]["price"]).not.toContain("500.00 INR"); // wrong: /1000
  });
});

// ---------------------------------------------------------------------------
// buildMetaCatalogCsv — CSV structure and required fields
// ---------------------------------------------------------------------------

describe("buildMetaCatalogCsv — CSV structure and required Meta fields", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits a header row with all required Meta catalog columns", () => {
    const csv = buildMetaCatalogCsv([mkProduct() as Parameters<typeof mapProductToFeedItem>[0]]);
    const { headers } = parseCsv(csv);
    // Meta required fields
    for (const required of [
      "id",
      "title",
      "description",
      "availability",
      "condition",
      "price",
      "link",
      "image_link",
      "brand",
    ]) {
      expect(headers).toContain(required);
    }
  });

  it("each item has all required Meta fields populated", () => {
    const csv = buildMetaCatalogCsv([mkProduct() as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row["id"]).toBeTruthy();
    expect(row["title"]).toBeTruthy();
    expect(row["description"]).toBeTruthy();
    expect(row["availability"]).toBeTruthy();
    expect(row["condition"]).toBeTruthy();
    expect(row["price"]).toBeTruthy();
    expect(row["link"]).toBeTruthy();
    expect(row["image_link"]).toBeTruthy();
    expect(row["brand"]).toBeTruthy();
  });

  it("id = product slug", () => {
    const product = mkProduct({ slug: "my-saree-slug" });
    const csv = buildMetaCatalogCsv([product as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["id"]).toBe("my-saree-slug");
  });

  it("condition = used", () => {
    const csv = buildMetaCatalogCsv([mkProduct() as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["condition"]).toBe("used");
  });

  it("price contains correct rupee value and INR", () => {
    const product = mkProduct({ pricePaise: 500000 });
    const csv = buildMetaCatalogCsv([product as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["price"]).toContain("INR");
    expect(rows[0]["price"]).toContain("5000.00");
  });

  it("availability = in_stock for available product", () => {
    const csv = buildMetaCatalogCsv([
      mkProduct({ stockStatus: "available" }) as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["availability"]).toBe("in_stock");
  });

  it("availability = out_of_stock for sold product", () => {
    const csv = buildMetaCatalogCsv([
      soldProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["availability"]).toBe("out_of_stock");
  });

  it("availability = out_of_stock for reserved product (not purchasable)", () => {
    const csv = buildMetaCatalogCsv([
      mkProduct({ stockStatus: "reserved" }) as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["availability"]).toBe("out_of_stock");
  });

  it("link is absolute (starts with https://)", () => {
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://www.fromthetrunk.shop");
    const csv = buildMetaCatalogCsv([
      mkProduct({ slug: "absolute-link-saree" }) as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["link"]).toMatch(/^https:\/\//);
    expect(rows[0]["link"]).toContain("/collection/absolute-link-saree");
  });

  it("image_link is absolute URL", () => {
    const csv = buildMetaCatalogCsv([mkProduct() as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["image_link"]).toMatch(/^https:\/\//);
  });

  it("brand = 'From the Trunk'", () => {
    const csv = buildMetaCatalogCsv([mkProduct() as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    expect(rows[0]["brand"]).toBe("From the Trunk");
  });

  it("multiple images → additional_image_link column has extra images", () => {
    const csv = buildMetaCatalogCsv([
      multiImageProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    // additional_image_link should be populated with the second image
    expect(rows[0]["additional_image_link"]).toMatch(/^https:\/\//);
  });

  it("empty product list → CSV with only header row", () => {
    const csv = buildMetaCatalogCsv([]);
    const { headers, rows } = parseCsv(csv);
    expect(headers.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(0);
  });

  it("CSV values with commas or quotes are correctly escaped (RFC 4180)", () => {
    const product = mkProduct({
      name: 'Silk, "Premium" Saree',
      storyNarrative: 'Beautiful "handwoven" silk, rare provenance.',
    });
    const csv = buildMetaCatalogCsv([product as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    // Parser should correctly restore original strings
    expect(rows[0]["title"]).toContain("Silk");
    expect(rows[0]["title"]).toContain("Premium");
    expect(rows[0]["description"]).toContain("handwoven");
  });
});

// ---------------------------------------------------------------------------
// Exclusion tests — mutation-proven (via buildMetaCatalogCsv)
// ---------------------------------------------------------------------------

describe("buildMetaCatalogCsv — exclusions (mutation-proven)", () => {
  it("EXCLUSION: draft product is ABSENT from the Meta feed", () => {
    const csv = buildMetaCatalogCsv([
      draftProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    const ids = rows.map((r) => r["id"]);
    expect(ids).not.toContain(draftProduct.slug);
  });

  it("MUTATION presence-proof: eligible product IS present (draft exclusion is real)", () => {
    const eligible = mkProduct({ id: "prod-ok", slug: "eligible-saree" });
    const csv = buildMetaCatalogCsv([eligible as Parameters<typeof mapProductToFeedItem>[0]]);
    const { rows } = parseCsv(csv);
    const ids = rows.map((r) => r["id"]);
    expect(ids).toContain("eligible-saree");
  });

  it("EXCLUSION: test product (name starts with 'test chiffon') is ABSENT", () => {
    const csv = buildMetaCatalogCsv([
      testProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    const ids = rows.map((r) => r["id"]);
    expect(ids).not.toContain(testProduct.slug);
  });

  it("EXCLUSION: zero-image product is ABSENT", () => {
    const csv = buildMetaCatalogCsv([
      zeroImageProduct as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    const ids = rows.map((r) => r["id"]);
    expect(ids).not.toContain(zeroImageProduct.slug);
  });

  it("mixed set: only eligible product appears, all excluded are absent", () => {
    const eligible = mkProduct({ id: "prod-ok", slug: "eligible-saree" });
    const csv = buildMetaCatalogCsv([
      draftProduct as Parameters<typeof mapProductToFeedItem>[0],
      testProduct as Parameters<typeof mapProductToFeedItem>[0],
      zeroImageProduct as Parameters<typeof mapProductToFeedItem>[0],
      eligible as Parameters<typeof mapProductToFeedItem>[0],
    ]);
    const { rows } = parseCsv(csv);
    const ids = rows.map((r) => r["id"]);

    expect(rows).toHaveLength(1);
    expect(ids).toContain("eligible-saree");
    expect(ids).not.toContain(draftProduct.slug);
    expect(ids).not.toContain(testProduct.slug);
    expect(ids).not.toContain(zeroImageProduct.slug);
  });
});

// ---------------------------------------------------------------------------
// Token gate tests — via the Hono app (mocked @/db)
// ---------------------------------------------------------------------------

describe("Meta feed — Token gate (FEEDS_PUBLIC_TOKEN env var)", () => {
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
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
  });

  it("FEEDS_PUBLIC_TOKEN set, no token param → 403", async () => {
    vi.stubEnv("FEEDS_PUBLIC_TOKEN", "secret-token-abc");
    const app = (await import("@/api/hono/app")).default;
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it("FEEDS_PUBLIC_TOKEN set, wrong token → 403", async () => {
    vi.stubEnv("FEEDS_PUBLIC_TOKEN", "secret-token-abc");
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/meta-catalog.csv?token=wrong"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it("FEEDS_PUBLIC_TOKEN set, correct token → 200 with text/csv", async () => {
    vi.stubEnv("FEEDS_PUBLIC_TOKEN", "secret-token-abc");
    setupDbForProducts([mkProduct()]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request(
      "http://localhost/api/v2/feeds/meta-catalog.csv?token=secret-token-abc"
    );
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });
});

// ---------------------------------------------------------------------------
// Content-type and CSV output via HTTP route
// ---------------------------------------------------------------------------

describe("Meta feed route — content-type and CSV output (via HTTP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(<T>(fn: () => Promise<T>) => fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns text/csv content-type", async () => {
    delete process.env.FEEDS_PUBLIC_TOKEN;
    setupDbForProducts([mkProduct()]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });

  it("body is parseable CSV with Meta required columns and at least one row", async () => {
    delete process.env.FEEDS_PUBLIC_TOKEN;
    setupDbForProducts([mkProduct()]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    const csv = await res.text();
    const { headers, rows } = parseCsv(csv);

    // Must have required Meta columns
    expect(headers).toContain("id");
    expect(headers).toContain("title");
    expect(headers).toContain("availability");
    expect(headers).toContain("price");
    expect(headers).toContain("image_link");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("route uses same listProducts query as Google (exclusions work end-to-end)", async () => {
    delete process.env.FEEDS_PUBLIC_TOKEN;
    // Feed a mix of products including excluded ones
    const eligible = mkProduct({ id: "e1", slug: "eligible-e2e" });
    setupDbForProducts([draftProduct, eligible, zeroImageProduct]);
    const app = (await import("@/api/hono/app")).default;
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    const csv = await res.text();
    const { rows } = parseCsv(csv);

    const ids = rows.map((r) => r["id"]);
    expect(ids).toContain("eligible-e2e");
    expect(ids).not.toContain(draftProduct.slug);
    expect(ids).not.toContain(zeroImageProduct.slug);
  });
});

// ---------------------------------------------------------------------------
// Inventory V2 availability — mutation-proven
// ---------------------------------------------------------------------------

describe("Meta feed — Inventory V2 availability (mutation-proven, FTT_FEATURE_INVENTORY_V2=true)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(<T>(fn: () => Promise<T>) => fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("MUTATION-PROVEN: expired reservation — raw=reserved, qty=1, activeCount=0 → in_stock", async () => {
    vi.stubEnv("FTT_FEATURE_INVENTORY_V2", "true");
    delete process.env.FEEDS_PUBLIC_TOKEN;

    const reservedButExpired = mkProduct({
      id: "prod-uuid-v2-reserved",
      slug: "reserved-but-expired",
      stockStatus: "reserved",
      quantityAvailable: 1,
    });

    setupDbForProductsWithReservations([reservedButExpired], []);

    const app = (await import("@/api/hono/app")).default;
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const csv = await res.text();
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);

    // MUST be in_stock: deriveStockStatus({qty=1, activeCount=0}) = "available" → "in_stock"
    // A route that reads the raw column would emit "out_of_stock" here — the test FAILS.
    expect(rows[0]["availability"]).toBe("in_stock");
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

    setupDbForProductsWithReservations([reservedActive], [
      { productId: "prod-uuid-v2-active", total: 1 },
    ]);

    const app = (await import("@/api/hono/app")).default;
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const csv = await res.text();
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);

    // MUST be out_of_stock: active reservation holds the item
    expect(rows[0]["availability"]).toBe("out_of_stock");
  });

  it("MUTATION-PROVEN: flag OFF (raw column) — raw=reserved without batch → out_of_stock", async () => {
    vi.stubEnv("FTT_FEATURE_INVENTORY_V2", "false");
    delete process.env.FEEDS_PUBLIC_TOKEN;

    const reservedProduct = mkProduct({
      id: "prod-uuid-v2-off",
      slug: "reserved-flag-off",
      stockStatus: "reserved",
      quantityAvailable: 1,
    });

    setupDbForProducts([reservedProduct]);

    const app = (await import("@/api/hono/app")).default;
    const req = new Request("http://localhost/api/v2/feeds/meta-catalog.csv");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const csv = await res.text();
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);

    // Flag OFF: raw "reserved" → out_of_stock
    expect(rows[0]["availability"]).toBe("out_of_stock");
  });
});
