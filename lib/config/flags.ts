/**
 * Feature flags for From the Trunk.
 *
 * All flags default to OFF so that the codebase can be shipped to production
 * safely without any behavioural change. Each flag is activated by setting its
 * environment variable to the string "true".
 */

/**
 * When true, pricePaise values are treated as GST-INCLUSIVE all-in prices.
 * The GST component is back-calculated for display: round(price × rate / (1 + rate)).
 * Total = subtotal + shippingCost (no GST added on top).
 *
 * When false (default), pricePaise is GST-EXCLUSIVE and calculateOrderTotals
 * adds GST on top: taxAmount = round(subtotal × rate); total = subtotal + shipping + tax.
 *
 * Flip this flag only after the corresponding product-data migration is complete.
 */
export function isGstInclusive(): boolean {
  return process.env.FTT_FEATURE_GST_INCLUSIVE === "true";
}

/**
 * When true, the reservation-based inventory claim is used in the create-order path.
 * A row is inserted into the `reservations` table with a conditional quantity check:
 * the insert only succeeds if quantity_available >= qty.
 *
 * When false (default), the existing stock_status atomic claim is used EXACTLY as before:
 * products.stockStatus is set to "reserved" with a conditional WHERE clause.
 * Dual-write (quantity_available + reservations table) occurs in BOTH paths so the new
 * columns stay populated for the Neon rehearsal.
 *
 * Flip this flag only after the 0004_inventory_v2 migration has run in production.
 */
export function isInventoryV2(): boolean {
  return process.env.FTT_FEATURE_INVENTORY_V2 === "true";
}

/**
 * When true, the homepage (/) renders its sections via the block-content engine
 * (lib/content/seed/homepage-blocks.ts fixture → renderBlock dispatch).
 * This is the P3-10 proof-of-concept flag.
 *
 * When false (default), the homepage renders the existing hardcoded JSX EXACTLY
 * as before this change — no behavioural difference.
 *
 * Flip this only after the homepage CMS page row + published page_version are
 * inserted (scripts/seed-homepage-cms.ts) and verified in staging.
 */
export function isBlocksHomepage(): boolean {
  return process.env.FTT_FEATURE_BLOCKS_HOMEPAGE === "true";
}
