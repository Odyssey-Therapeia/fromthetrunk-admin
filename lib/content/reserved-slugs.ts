/**
 * P3-01: Reserved-slug deny-list.
 *
 * A pure function that rejects any slug that would collide with an existing
 * top-level route segment in the app. Derived from actual route directories:
 *
 *   app/(site)/ top-level dirs: account, cart, checkout, collection,
 *     how-it-works, our-story, packing, privacy-policy, return-policy,
 *     search, shipping-policy, terms-of-service, why
 *
 *   app/(admin)/admin/ top-level dirs (the admin namespace): admin
 *
 *   app/api/ top-level namespace: api
 *
 *   Additional deny-list entries: order (used in order-confirmation URLs)
 */

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // app/(site) route segments
  "account",
  "cart",
  "checkout",
  "collection",
  "how-it-works",
  "our-story",
  "packing",
  "privacy-policy",
  "return-policy",
  "search",
  "shipping-policy",
  "terms-of-service",
  "why",
  // top-level namespaces
  "admin",
  "api",
  // additional deny-list entries
  "order",
]);

/**
 * Returns true if the given slug collides with a real top-level route segment.
 *
 * Only exact matches are blocked — "my-checkout-page" is allowed while
 * "checkout" is not.
 *
 * This is a pure function: no I/O, no side effects.
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
