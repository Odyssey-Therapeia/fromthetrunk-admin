/**
 * P5-01: Product feed routes.
 *
 * GET /api/v2/feeds/google-merchant.xml
 *   — Google Merchant Center RSS 2.0 product feed.
 *   — Uses the exact same listProducts query as the sitemap so the feed and
 *     sitemap cannot disagree.
 *   — Shared mapping via lib/channels/feed-mapping.ts so the Meta feed (P5-02)
 *     reuses the same logic and the two feeds cannot drift.
 *
 * Security: feeds are PUBLIC by design (Google/Meta fetch unauthenticated).
 *   Optional static deterrent token: if FEEDS_PUBLIC_TOKEN is set, the request
 *   must carry ?token=<value> or the response is 403.
 */

import { OpenAPIHono } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";
import { listProducts } from "@/db/queries/products";
import type { ProductWithRelations } from "@/db/queries/products";
import { getBatchActiveReservationsCounts } from "@/db/queries/reservations";
import { deriveStockStatus } from "@/db/inventory";
import { isInventoryV2 } from "@/lib/config/flags";
import { mapProductToFeedItem } from "@/lib/channels/feed-mapping";

// ---------------------------------------------------------------------------
// Test-product exclusion identifier (P1-15)
// The live "test chiffon do not buy if not authorized" product must never
// appear in the feed. We match on the lower-cased name prefix.
// ---------------------------------------------------------------------------
const TEST_PRODUCT_NAME_PREFIX = "test chiffon";

/**
 * Returns true if a product should be excluded from the feed.
 *
 * Exclusion rules (feed-level, documented in docs/spikes/channel-audit.md):
 *  1. Drafts  — already filtered by listProducts({ includeDrafts: false }),
 *               but we guard here too in case the products array is injected
 *               directly (e.g. in tests).
 *  2. Test product — name starts with "test chiffon" (case-insensitive).
 *  3. Zero-image items — g:image_link is required by Google Merchant Center.
 */
export function shouldExcludeFromFeed(product: ProductWithRelations): boolean {
  if (product.status !== "published") return true;
  if (product.name.toLowerCase().startsWith(TEST_PRODUCT_NAME_PREFIX)) return true;
  if (product.images.length === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// XML serialisation helpers
// ---------------------------------------------------------------------------

/** Escape special XML characters in text content. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap content in an XML element. Skips if value is null/undefined. */
function el(tag: string, value: string | null | undefined): string {
  if (value == null) return "";
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

/**
 * Serialise eligible products to a Google Merchant Center RSS 2.0 feed string.
 *
 * This function is exported so tests can call it directly with injected product
 * arrays (mock @/db, run listProducts for real, then call this serialiser).
 *
 * @param activeReservationsCounts - Optional batch reservations map (productId → count).
 *   When provided (i.e. when FTT_FEATURE_INVENTORY_V2 is ON), each product's
 *   effective stockStatus is derived via deriveStockStatus() instead of reading
 *   the raw column. This mirrors app/(site)/collection/[slug]/page.tsx:86-91.
 *   When absent (flag OFF), the raw column is used as-is.
 */
export function buildGoogleMerchantFeedXml(
  products: ProductWithRelations[],
  activeReservationsCounts?: Map<string, number>
): string {
  const eligible = products.filter((p) => !shouldExcludeFromFeed(p));

  const items = eligible
    .map((product) => {
      // When inventory v2 is active, derive the effective stockStatus so the feed
      // matches the PDP — a product whose raw status is "reserved" but whose
      // reservation has expired will correctly appear as "in_stock" here.
      let effectiveProduct = product;
      if (activeReservationsCounts !== undefined) {
        const activeReservationsCount =
          activeReservationsCounts.get(product.id) ?? 0;
        const effectiveStockStatus = deriveStockStatus({
          quantityAvailable: product.quantityAvailable,
          activeReservationsCount,
        });
        if (effectiveStockStatus !== product.stockStatus) {
          effectiveProduct = { ...product, stockStatus: effectiveStockStatus };
        }
      }
      const item = mapProductToFeedItem(effectiveProduct);

      const additionalImages = item.additionalImageUrls
        .map((url) => el("g:additional_image_link", url))
        .join("\n      ");

      return `  <item>
    ${el("g:id", item.id)}
    ${el("title", item.title)}
    ${el("g:description", item.description)}
    ${el("link", item.link)}
    ${el("g:price", `${item.price.toFixed(2)} ${item.currency}`)}
    ${el("g:availability", item.availability)}
    ${el("g:condition", item.condition)}
    ${el("g:identifier_exists", "no")}
    ${el("g:brand", item.brand)}
    ${el("g:image_link", item.imageUrl)}
    ${additionalImages}
  </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>From the Trunk — Product Feed</title>
    <link>https://www.fromthetrunk.shop</link>
    <description>Curated pre-loved luxury sarees with provenance.</description>
${items}
  </channel>
</rss>`;
}

// ---------------------------------------------------------------------------
// CSV serialisation helpers (Meta catalog feed — P5-02)
// ---------------------------------------------------------------------------

/**
 * Escape a single CSV cell per RFC 4180.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 * Embedded double-quotes are doubled.
 */
function escapeCsvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Meta catalog CSV column headers.
 * Required by Meta: id, title, description, availability, condition, price,
 * link, image_link, brand. Optional but recommended: additional_image_link.
 */
const META_CSV_HEADERS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
  "additional_image_link",
] as const;

/**
 * Serialise eligible products to a Meta catalog CSV string.
 *
 * Exported so tests can call it directly with injected product arrays
 * (mock @/db, run listProducts for real, then call this serialiser).
 *
 * The ONLY Meta-specific code here is the column mapping (FeedItemData field
 * names → Meta CSV column names + value formats). All price, availability,
 * description, exclusion, and image logic lives in lib/channels/feed-mapping.ts
 * and feeds.ts:shouldExcludeFromFeed — this function does not duplicate any of it.
 *
 * @param activeReservationsCounts - Optional batch reservations map (productId → count).
 *   When provided (i.e. when FTT_FEATURE_INVENTORY_V2 is ON), each product's
 *   effective stockStatus is derived via deriveStockStatus(). Mirrors Google route.
 */
export function buildMetaCatalogCsv(
  products: ProductWithRelations[],
  activeReservationsCounts?: Map<string, number>
): string {
  const eligible = products.filter((p) => !shouldExcludeFromFeed(p));

  const headerRow = META_CSV_HEADERS.map(escapeCsvCell).join(",");

  const dataRows = eligible.map((product) => {
    // Mirror the Google route: when inventory v2 is active, derive effective
    // stockStatus so the Meta feed matches the PDP — same pattern as Google.
    let effectiveProduct = product;
    if (activeReservationsCounts !== undefined) {
      const activeReservationsCount =
        activeReservationsCounts.get(product.id) ?? 0;
      const effectiveStockStatus = deriveStockStatus({
        quantityAvailable: product.quantityAvailable,
        activeReservationsCount,
      });
      if (effectiveStockStatus !== product.stockStatus) {
        effectiveProduct = { ...product, stockStatus: effectiveStockStatus };
      }
    }

    // THE LOAD-BEARING CALL: reuse the shared mapping — no reimplementation.
    const item = mapProductToFeedItem(effectiveProduct);

    // Meta vocabulary:
    // - availability: "in_stock" / "out_of_stock" (same as FeedAvailability)
    // - price: "1234.00 INR"
    // - additional_image_link: first additional image (Meta accepts one per column;
    //   for multiple extras, rows can repeat or a comma-separated list is used —
    //   we emit the first additional image URL in the column, which is the common
    //   single-column approach for Meta catalog CSVs).
    const cells: string[] = [
      escapeCsvCell(item.id),
      escapeCsvCell(item.title),
      escapeCsvCell(item.description),
      escapeCsvCell(item.availability),
      escapeCsvCell(item.condition),
      escapeCsvCell(`${item.price.toFixed(2)} ${item.currency}`),
      escapeCsvCell(item.link),
      escapeCsvCell(item.imageUrl ?? ""),
      escapeCsvCell(item.brand),
      escapeCsvCell(item.additionalImageUrls[0] ?? ""),
    ];

    return cells.join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerFeedsRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/google-merchant.xml", async (c) => {
    // Optional deterrent token gate
    const configuredToken = process.env.FEEDS_PUBLIC_TOKEN;
    if (configuredToken) {
      const provided = c.req.query("token");
      if (provided !== configuredToken) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // Fetch ALL published products using the same query as the sitemap
    const { rows: products } = await listProducts({
      includeDrafts: false,
      limit: 1000,
      offset: 0,
    });

    // P5-01 (prior finding): when FTT_FEATURE_INVENTORY_V2 is ON, derive each
    // product's effective stockStatus from quantity + active reservations (batch,
    // one round-trip) — mirroring app/(site)/collection/[slug]/page.tsx:86-91.
    // When flag OFF: pass no map; buildGoogleMerchantFeedXml reads the raw column.
    let activeReservationsCounts: Map<string, number> | undefined;
    if (isInventoryV2()) {
      const eligibleIds = products
        .filter((p) => !shouldExcludeFromFeed(p))
        .map((p) => p.id);
      activeReservationsCounts = await getBatchActiveReservationsCounts(eligibleIds);
    }

    const xml = buildGoogleMerchantFeedXml(products, activeReservationsCounts);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // Instruct intermediate caches to hold the feed for 1 hour
        "Cache-Control": "public, max-age=3600",
      },
    });
  });

  // -------------------------------------------------------------------------
  // P5-02: Meta catalog feed
  // GET /api/v2/feeds/meta-catalog.csv
  // Reuses the SAME shared mapping (mapProductToFeedItem), SAME exclusion
  // function (shouldExcludeFromFeed), and SAME listProducts query as the
  // Google feed — only the serialiser differs (CSV instead of RSS XML).
  // -------------------------------------------------------------------------
  app.get("/meta-catalog.csv", async (c) => {
    // Optional deterrent token gate — identical to Google feed gate
    const configuredToken = process.env.FEEDS_PUBLIC_TOKEN;
    if (configuredToken) {
      const provided = c.req.query("token");
      if (provided !== configuredToken) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // Fetch ALL published products — SAME query as the Google feed and sitemap
    const { rows: products } = await listProducts({
      includeDrafts: false,
      limit: 1000,
      offset: 0,
    });

    // When FTT_FEATURE_INVENTORY_V2 is ON, derive each product's effective
    // stockStatus from quantity + active reservations — mirrors Google route
    // exactly so both feeds agree with the PDP on availability.
    let activeReservationsCounts: Map<string, number> | undefined;
    if (isInventoryV2()) {
      const eligibleIds = products
        .filter((p) => !shouldExcludeFromFeed(p))
        .map((p) => p.id);
      activeReservationsCounts = await getBatchActiveReservationsCounts(eligibleIds);
    }

    const csv = buildMetaCatalogCsv(products, activeReservationsCounts);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // Instruct intermediate caches to hold the feed for 1 hour
        "Cache-Control": "public, max-age=3600",
      },
    });
  });
};
