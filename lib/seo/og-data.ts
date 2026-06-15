/**
 * P5-06: Per-product OG data extraction — pure function, no side effects.
 *
 * Derives the title, price (in rupees), and first image URL from a product
 * for use in the PDP opengraph-image route (app/(site)/collection/[slug]/
 * opengraph-image.tsx). Tested in tests/unit/aeo-schema-completeness.test.ts.
 *
 * Uses the same resolveMediaURL + pricePaise / 100 convention as the rest of
 * the codebase (P1-10: one INR formatter).
 */

import type { Product } from "@/types/domain";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getProductDisplayDetails } from "@/lib/products/display-details";

export type PdpOgData = {
  /** The OG title: product name + fabric shorthand. */
  title: string;
  /** Price in rupees (pricePaise / 100). */
  priceRupees: number;
  /** Absolute URL of the first product image, or null if none. */
  imageUrl: string | null;
};

/**
 * Extract the per-product OG data needed by the opengraph-image route.
 * Pure function — no DB calls, no async.
 */
export function extractPdpOgData(product: Product): PdpOgData {
  const displayDetails = getProductDisplayDetails(product);
  const imageUrl = resolveMediaURL(product.images?.[0]) ?? null;

  const title = `${product.name} — ${displayDetails.fabric}`;

  return {
    title,
    priceRupees: product.pricePaise / 100,
    imageUrl,
  };
}
