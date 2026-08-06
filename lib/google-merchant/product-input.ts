/**
 * Product → Merchant API `ProductInput` mapping for the ONE controlled insert.
 *
 * SERVER ONLY in practice, but deliberately PURE: no network, no database, no
 * environment reads beyond what `mapProductToFeedItem` already does. Everything
 * here is a function of the product row, which is what makes the mapping
 * exhaustively unit-testable.
 *
 * The shared feed mapper (`lib/channels/feed-mapping.ts`) remains the source of
 * truth for title, description, images, price basis, condition and availability
 * semantics — the storefront, the Google feed, the Meta feed and this insert
 * must not drift. Four things are deliberately overridden:
 *
 *   1. offerId — the feed uses `product.slug` as its item id, but a slug is
 *      editable. The Merchant offer is keyed on `product.id` (the immutable
 *      UUID) so a future rename cannot orphan or duplicate the offer.
 *   2. brand — the feed submits the store name "From the Trunk". That is a
 *      retailer, not the manufacturer of a pre-loved saree. Brand is only
 *      submitted when `detailsDesigner` names a recognised label; otherwise it
 *      is omitted (see `resolveVerifiedBrand`).
 *   3. price — the feed emits rupees as a float for RSS. Merchant API takes
 *      micros, computed here with BigInt so no float ever touches the amount.
 *   4. link / canonicalLink — the feed derives its origin from
 *      `NEXT_PUBLIC_SERVER_URL`, which on this deployment is the ADMIN domain.
 *      Merchant links must target the claimed storefront, so the origin is
 *      pinned to `CANONICAL_SITE_ORIGIN` (see `buildCanonicalLandingPageUrl`).
 *
 * `identifierExists` is always false: a one-of-one pre-loved saree has no GTIN
 * and no MPN, and inventing either would be a policy violation.
 */

import type { ProductWithRelations } from "@/db/queries/products";
import type { StockStatus } from "@/db/inventory";
import { mapProductToFeedItem } from "@/lib/channels/feed-mapping";
import {
  CANONICAL_SITE_ORIGIN,
  GoogleMerchantError,
  GoogleMerchantProductDataError,
} from "@/lib/google-merchant/config";
import { getProductDisplayDetails } from "@/lib/products/display-details";

/** The single product this endpoint is allowed to insert. */
export const TEST_INSERT_PRODUCT_ID = "6747c35c-682b-4387-a710-b165249470a2";

/** Its expected slug — a mismatch means the UUID now points at another row. */
export const TEST_INSERT_PRODUCT_SLUG = "tangerine-noir-floral-border-weave";

/** Google accepts at most 10 additional image links. */
const MAX_ADDITIONAL_IMAGE_LINKS = 10;

/**
 * Paise → micros: 1 paise = 10 000 micros (1 rupee = 1 000 000 micros).
 *
 * Written as `BigInt(10_000)` rather than the `10000n` literal because the
 * repository targets ES2017, where BigInt literal syntax does not compile. The
 * arithmetic is identical — BigInt throughout, no float ever involved.
 */
const MICROS_PER_PAISE = BigInt(10_000);

export type MerchantProductAttributes = {
  title: string;
  description: string;
  link: string;
  canonicalLink: string;
  imageLink: string;
  additionalImageLinks: string[];
  availability: "IN_STOCK";
  condition: "USED";
  identifierExists: false;
  price: { amountMicros: string; currencyCode: "INR" };
  material: string;
  color: string;
  gender: string;
  ageGroup: string;
  size: string;
  /** Present only when a recognised manufacturer/label was verified. */
  brand?: string;
};

export type MerchantProductInput = {
  offerId: string;
  contentLanguage: "en";
  feedLabel: "IN";
  productAttributes: MerchantProductAttributes;
};

// ---------------------------------------------------------------------------
// Brand verification
// ---------------------------------------------------------------------------

/**
 * Labels we accept as a real product manufacturer.
 *
 * Deliberately an ALLOWLIST rather than a heuristic. `detailsDesigner` is a
 * free-text admin field that in practice holds curation notes ("Handloom
 * weaver, Kanchipuram"), placeholders ("Unknown") or descriptive prose — none
 * of which are brands, and submitting any of them would misattribute the offer.
 * Failing closed (omit brand) costs nothing; guessing wrong is a data-quality
 * violation. Extending this list is a deliberate, reviewed action.
 */
const RECOGNISED_BRANDS = [
  "anita dongre",
  "biba",
  "ekaya",
  "fabindia",
  "good earth",
  "jaypore",
  "kalki",
  "kanakavalli",
  "manish malhotra",
  "masaba",
  "nalli",
  "pothys",
  "raw mango",
  "ritu kumar",
  "rmkv",
  "sabyasachi",
  "satya paul",
  "taneira",
  "tarun tahiliani",
  "torani",
] as const;

const normaliseBrandKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Return the verified brand for a product, or null when there is none.
 *
 * A match must be exact after normalisation — "Nalli" and "NALLI Silks"
 * normalise differently, and only an entry present in `RECOGNISED_BRANDS`
 * qualifies. Anything else (empty, placeholder, generic, curation copy,
 * descriptive text, the retailer's own name) yields null.
 */
export function resolveVerifiedBrand(
  designer: null | string | undefined,
): null | string {
  if (typeof designer !== "string") return null;

  const trimmed = designer.trim();
  if (trimmed.length === 0) return null;

  const key = normaliseBrandKey(trimmed);
  if (!RECOGNISED_BRANDS.some((brand) => brand === key)) return null;

  // The admin's spelling is submitted (trimmed) — the allowlist is stored
  // normalised purely for matching, and lower-casing the brand would be worse
  // than the human-entered casing.
  return trimmed;
}

// ---------------------------------------------------------------------------
// Apparel attributes
// ---------------------------------------------------------------------------

/** Google's accepted `gender` values. */
const GENDER_VALUES = new Set(["male", "female", "unisex"]);

/** Google's accepted `ageGroup` values. */
const AGE_GROUP_VALUES = new Set([
  "newborn",
  "infant",
  "toddler",
  "kids",
  "adult",
]);

/**
 * Attribute keys we will read for each Merchant field.
 *
 * `products.attributes` is a free-form jsonb object keyed by attribute slug
 * (lib/catalog/type-schema.ts), so we accept the obvious spellings of each key
 * but never fall back to a different field: colour is NOT inferred from the
 * title, and `detailsLength` (a drape measurement, with a fabricated default
 * when unset) is NOT treated as an apparel size.
 */
const ATTRIBUTE_KEYS: Record<ApparelField, string[]> = {
  // Compared after normalisation, so "age_group", "age-group" and "Age Group"
  // all match "agegroup".
  ageGroup: ["agegroup"],
  color: ["color", "colour"],
  gender: ["gender"],
  size: ["size"],
};

export type ApparelField = "ageGroup" | "color" | "gender" | "size";

export type ApparelAttributes = Record<ApparelField, string>;

const normaliseAttributeKey = (key: string): string =>
  key.toLowerCase().replace(/[\s_-]+/g, "");

/** Read the first non-empty string stored under any of `keys`. */
function readAttribute(
  attributes: Record<string, unknown>,
  keys: string[],
): null | string {
  const wanted = new Set(keys.map(normaliseAttributeKey));

  for (const [key, value] of Object.entries(attributes)) {
    if (!wanted.has(normaliseAttributeKey(key))) continue;
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }

  return null;
}

/**
 * Resolve the four apparel attributes Google requires for this product type.
 *
 * A value that is present but outside Google's enum (`gender`, `ageGroup`) is
 * reported as missing: it cannot be submitted, and silently correcting it would
 * be inventing data.
 */
export function resolveApparelAttributes(product: ProductWithRelations): {
  missing: ApparelField[];
  values: Partial<ApparelAttributes>;
} {
  const attributes =
    typeof product.attributes === "object" && product.attributes !== null
      ? product.attributes
      : {};

  const values: Partial<ApparelAttributes> = {};
  const missing: ApparelField[] = [];

  const color = readAttribute(attributes, ATTRIBUTE_KEYS.color);
  if (color) values.color = color;
  else missing.push("color");

  const gender = readAttribute(attributes, ATTRIBUTE_KEYS.gender);
  if (gender && GENDER_VALUES.has(gender.toLowerCase())) {
    values.gender = gender.toLowerCase();
  } else {
    missing.push("gender");
  }

  const ageGroup = readAttribute(attributes, ATTRIBUTE_KEYS.ageGroup);
  if (ageGroup && AGE_GROUP_VALUES.has(ageGroup.toLowerCase())) {
    values.ageGroup = ageGroup.toLowerCase();
  } else {
    missing.push("ageGroup");
  }

  const size = readAttribute(attributes, ATTRIBUTE_KEYS.size);
  if (size) values.size = size;
  else missing.push("size");

  return { missing, values };
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Hostname Google has the claim for — the only one a product link may use. */
const CANONICAL_SITE_HOSTNAME = new URL(CANONICAL_SITE_ORIGIN).hostname;

/**
 * Build the Merchant landing-page URL for a product.
 *
 * Deliberately NOT taken from `mapProductToFeedItem`, whose origin comes from
 * `getSiteOrigin()` / `NEXT_PUBLIC_SERVER_URL`. On this deployment that
 * variable is the ADMIN application domain (admin.fromthetrunk.shop) — a
 * perfectly correct value for the admin app, and a wrong one for Google, which
 * must be sent to the claimed storefront. The origin is therefore pinned here
 * rather than inherited, and no environment variable can move it.
 *
 * The RSS and Meta feeds keep using the mapper's link unchanged; `getSiteOrigin`
 * is not touched.
 *
 * The constructed URL is then re-parsed and checked, so a slug carrying a query
 * string, a fragment, credentials or `../` traversal cannot smuggle anything
 * into the link.
 */
function buildCanonicalLandingPageUrl(slug: string): URL {
  const landingPageUrl = `${CANONICAL_SITE_ORIGIN}/collection/${slug}`;

  let link: URL;
  try {
    link = new URL(landingPageUrl);
  } catch {
    throw new GoogleMerchantError(
      "PRODUCT_LINK_INVALID",
      "The product landing-page URL is not a valid URL.",
      422,
    );
  }

  const isCanonical =
    link.protocol === "https:" &&
    link.hostname === CANONICAL_SITE_HOSTNAME &&
    link.pathname === `/collection/${slug}` &&
    link.username === "" &&
    link.password === "" &&
    link.search === "" &&
    link.hash === "";

  if (!isCanonical) {
    throw new GoogleMerchantError(
      "PRODUCT_LINK_INVALID",
      "The product landing-page URL is not a clean canonical storefront URL.",
      422,
    );
  }

  return link;
}

/**
 * Absolutise and validate a media URL.
 *
 * `resolveMediaURL` returns either an absolute URL (Vercel Blob) or a
 * site-relative path (`/media/...`), so relative paths are resolved against the
 * canonical origin. Only https survives — Google rejects http, and data:/blob:
 * URLs are not fetchable by the crawler.
 */
function toPublicImageUrl(raw: string): null | string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let url: URL;
  try {
    url = new URL(trimmed, `${CANONICAL_SITE_ORIGIN}/`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.hostname.length === 0) return null;

  return url.toString();
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build the Merchant API `ProductInput` for a product that has already been
 * confirmed published, correctly identified and purchasable by the caller.
 *
 * @throws {GoogleMerchantProductDataError} when apparel attributes are missing.
 * @throws {GoogleMerchantError} for any other unusable product data.
 */
export function buildMerchantProductInput({
  effectiveStockStatus,
  product,
}: {
  effectiveStockStatus: StockStatus;
  product: ProductWithRelations;
}): MerchantProductInput {
  const mapped = mapProductToFeedItem(product);

  // Availability: the caller has already checked the effective (inventory-v2
  // aware) status. Requiring the mapper to agree catches a stale stockStatus
  // column — on disagreement we refuse rather than advertise a held saree.
  if (effectiveStockStatus !== "available" || mapped.availability !== "in_stock") {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_PURCHASABLE",
      "The product is not currently purchasable.",
      409,
    );
  }

  // Price: integer arithmetic only. BigInt(pricePaise) * 10000n — never a float
  // multiplication, which would lose precision at larger amounts.
  if (!Number.isInteger(product.pricePaise) || product.pricePaise <= 0) {
    throw new GoogleMerchantError(
      "PRODUCT_PRICE_INVALID",
      "The product price is not a positive integer amount in paise.",
      422,
    );
  }

  const amountMicros = (
    BigInt(product.pricePaise) * MICROS_PER_PAISE
  ).toString();

  // Pinned to the claimed storefront origin, NOT to NEXT_PUBLIC_SERVER_URL.
  const landingPageUrl = buildCanonicalLandingPageUrl(product.slug).toString();

  if (mapped.imageUrl === null) {
    throw new GoogleMerchantError(
      "PRODUCT_IMAGE_MISSING",
      "The product has no resolvable public image.",
      422,
    );
  }

  const imageLink = toPublicImageUrl(mapped.imageUrl);
  if (!imageLink) {
    throw new GoogleMerchantError(
      "PRODUCT_IMAGE_INVALID",
      "The product's primary image is not a public https URL.",
      422,
    );
  }

  // Additional images keep the mapper's sortOrder ordering. Unresolvable extras
  // are dropped rather than failing the insert — the primary image is the one
  // Google requires.
  const additionalImageLinks = mapped.additionalImageUrls
    .map((url) => toPublicImageUrl(url))
    .filter((url): url is string => url !== null)
    .slice(0, MAX_ADDITIONAL_IMAGE_LINKS);

  const apparel = resolveApparelAttributes(product);
  if (apparel.missing.length > 0) {
    throw new GoogleMerchantProductDataError(apparel.missing);
  }

  // Safe: an empty `missing` list means every field resolved.
  const { ageGroup, color, gender, size } = apparel.values as ApparelAttributes;

  const material = getProductDisplayDetails(product).fabric;
  const brand = resolveVerifiedBrand(product.detailsDesigner);

  return {
    offerId: product.id,
    contentLanguage: "en",
    feedLabel: "IN",
    productAttributes: {
      title: mapped.title,
      description: mapped.description,
      link: landingPageUrl,
      canonicalLink: landingPageUrl,
      imageLink,
      additionalImageLinks,
      availability: "IN_STOCK",
      condition: "USED",
      // Always false: no GTIN and no MPN exist for a one-of-one pre-loved item,
      // and none will be invented. This holds even when a brand is verified.
      identifierExists: false,
      price: { amountMicros, currencyCode: "INR" },
      material,
      color,
      gender,
      ageGroup,
      size,
      ...(brand ? { brand } : {}),
    },
  };
}
