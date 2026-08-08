/**
 * Channel exclusion rules shared by every outbound product surface.
 *
 * Extracted from `api/hono/routes/feeds.ts` (P1-15) so the RSS feed, the Meta
 * catalog feed and the Google Merchant catalogue audit cannot drift on which
 * products must never leave the building. The rule itself is unchanged.
 */

/**
 * The live "test chiffon do not buy if not authorized" product must never be
 * published to a sales channel. Matched on the lower-cased name prefix.
 */
export const TEST_PRODUCT_NAME_PREFIX = "test chiffon";

/** True when a product is the deliberately excluded test listing. */
export function isExcludedTestProduct(product: { name: string }): boolean {
  return product.name.toLowerCase().startsWith(TEST_PRODUCT_NAME_PREFIX);
}
