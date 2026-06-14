/**
 * P5-01/P5-02: Shared product → channel feed item mapping.
 *
 * This is the single source of truth for the Google Merchant Center feed
 * (P5-01) and the Meta catalog feed (P5-02). Keeping both feeds wired to
 * this module ensures they cannot drift from each other or from the PDP.
 *
 * Price logic mirrors lib/seo/json-ld.ts: pricePaise / 100.
 * Both the PDP and the feeds emit the same number; when FTT_FEATURE_GST_INCLUSIVE
 * is ON, pricePaise IS the all-in price (feed price = landing-page price, as
 * required by Google India).
 *
 * Description fallback chain mirrors lib/seo/json-ld.ts:19-21:
 *   storyNarrative → storyTitle (+ fabric fallback) → name + fabric.
 *
 * Availability mirrors the json-ld availability logic at lines 34-39:
 *   stockStatus "available" → in_stock
 *   stockStatus "reserved"  → out_of_stock (held, not purchasable)
 *   stockStatus "sold"      → out_of_stock
 */

import type { ProductWithRelations } from "@/db/queries/products";
import { getProductDisplayDetails } from "@/lib/products/display-details";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getSiteOrigin } from "@/lib/config/site";

export type FeedAvailability = "in_stock" | "out_of_stock";

export type FeedItemData = {
  /** Stable product identifier — slug */
  id: string;
  /** Product display title */
  title: string;
  /** Plain-text description, sanitised */
  description: string;
  /** Price in rupees (pricePaise / 100) — the all-in price the PDP charges */
  price: number;
  /** Currency — always INR */
  currency: "INR";
  /** Feed availability value */
  availability: FeedAvailability;
  /** Absolute URL of the first product image */
  imageUrl: string | null;
  /** Absolute URLs of any additional images (sorted) */
  additionalImageUrls: string[];
  /** Absolute landing-page URL — same canonical as the sitemap */
  link: string;
  /** Always "used" for preloved */
  condition: "used";
  /** Always false — GTIN exemption for preloved one-of-one items */
  identifierExists: false;
  /** Store brand */
  brand: "From the Trunk";
};

/**
 * Strip HTML tags and collapse whitespace for plain-text description.
 * Used so storyNarrative (which may contain HTML or rich text) is safe for feeds.
 */
function sanitiseDescription(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")   // remove HTML tags
    .replace(/\s+/g, " ")        // collapse whitespace
    .trim();
}

/**
 * Map a fully-hydrated product to a feed item data object.
 *
 * Design decisions:
 * - Price: pricePaise / 100 (mirrors json-ld.ts:29 exactly, flag-agnostic at
 *   the mapping level — the pricePaise column already carries the correct value
 *   for whichever mode the flag selects; the PDP does the same division).
 * - Availability: mirrors json-ld.ts:34-39 but maps to Google's vocabulary.
 *   "reserved" is not purchasable on the site, so it maps to out_of_stock.
 * - Description: mirrors json-ld.ts:19-21 (storyNarrative ?? name+fabric).
 *   We also check storyTitle as an intermediate fallback as specified by P5-01.
 */
export function mapProductToFeedItem(
  product: ProductWithRelations
): FeedItemData {
  const displayDetails = getProductDisplayDetails(product);
  const siteOrigin = getSiteOrigin();

  // Description fallback chain: storyNarrative → storyTitle+fabric → name+fabric
  // Mirrors json-ld.ts:19-21 and P5-01 spec.
  const rawDescription: string =
    product.storyNarrative ??
    (product.storyTitle
      ? `${product.storyTitle}: ${displayDetails.fabric}.`
      : `${product.name}: ${displayDetails.fabric}.`);
  const description = sanitiseDescription(rawDescription);

  // Price: mirrors json-ld.ts:29 — pricePaise / 100 = rupees
  const price = product.pricePaise / 100;

  // Availability: mirrors json-ld.ts:34-39 mapped to Google's vocabulary.
  // available → in_stock; sold | reserved → out_of_stock.
  const availability: FeedAvailability =
    product.stockStatus === "available" ? "in_stock" : "out_of_stock";

  // Images: resolve absolute URLs for each image (sorted by sortOrder)
  const sortedImages = [...product.images].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const imageUrls = sortedImages
    .map((img) => resolveMediaURL(img))
    .filter((url): url is string => url !== null);

  const [imageUrl = null, ...additionalImageUrls] = imageUrls;

  // Landing page URL: same canonical as the sitemap (app/sitemap.ts:75-80)
  const link = `${siteOrigin}/collection/${product.slug}`;

  return {
    id: product.slug,
    title: product.name,
    description,
    price,
    currency: "INR",
    availability,
    imageUrl,
    additionalImageUrls,
    link,
    condition: "used",
    identifierExists: false,
    brand: "From the Trunk",
  };
}
