/**
 * Phase 2A.1 — controlled catalogue attribute backfill (PURE PLANNING).
 *
 * Fills ONLY catalogue-level defaults that are true for an entire product type:
 * a pre-loved saree is womenswear for adults in one size. Everything
 * product-specific — colour, fabric, designer, condition, price, stock, status,
 * images, title, description, slug — is never touched, and nothing is ever
 * inferred from a name, description, slug, image or model.
 *
 * This module plans; it does not write. It performs no database access, no
 * network I/O and no Google call. `planProductBackfill` is a function of the
 * product row plus its product type, which is what makes every safety rule
 * below directly testable.
 *
 * THE SAFETY RULE: a field is filled only when the stored value is absent,
 * null, undefined or an empty string. A non-empty existing value — of ANY type,
 * even one Google would reject — always wins, which is what makes `apply`
 * idempotent: after the first run the values exist, so the second run proposes
 * nothing.
 *
 * THE SCHEMA RULE: a value is only proposed when the product's TYPE actually
 * declares that attribute key, using the type's own spelling. Writing an
 * undeclared attribute would push data past `buildTypeZodSchema` validation,
 * so an undeclared key is reported as TYPE_ATTRIBUTE_NOT_DEFINED instead.
 */

import type { ProductWithRelations } from "@/db/queries/products";
import type { ProductTypeRecord } from "@/db/queries/product-types";
import {
  ATTRIBUTE_KEYS,
  findAttributeEntries,
  normaliseAttributeKey,
} from "@/lib/google-merchant/product-input";

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export type BackfillField = "ageGroup" | "gender" | "size";

/** The catalogue-level defaults, per product TYPE SLUG. */
export const BACKFILL_POLICIES: Record<
  string,
  Partial<Record<BackfillField, string>>
> = {
  /**
   * Blouses: womenswear for adults. `size` and `color` are NOT defaulted —
   * blouses are sized garments and their colour is product-specific.
   */
  blouse: { ageGroup: "ADULT", gender: "FEMALE" },
  /** Pre-loved sarees: womenswear for adults, one size. */
  "preloved-saree": { ageGroup: "ADULT", gender: "FEMALE", size: "OS" },
};

/**
 * The order fields are considered — and therefore reported — in. Explicit
 * rather than object-key order, so output ordering is deterministic by design
 * and not by accident of how a policy literal happens to be written.
 */
export const BACKFILL_FIELD_ORDER: readonly BackfillField[] = [
  "gender",
  "ageGroup",
  "size",
];

/** Attribute-key spellings accepted for each backfillable field. */
const FIELD_ALIASES: Record<BackfillField, string[]> = {
  ageGroup: ATTRIBUTE_KEYS.ageGroup,
  gender: ATTRIBUTE_KEYS.gender,
  size: ATTRIBUTE_KEYS.size,
};

/** Fields a human must fill per product — never defaulted, only reported. */
const PRODUCT_SPECIFIC_FIELDS = ["color"] as const;

export const BACKFILL_MANUAL_REASONS = [
  "TYPE_ATTRIBUTE_NOT_DEFINED",
  "PRODUCT_SPECIFIC_VALUE_REQUIRED",
  "UNKNOWN_PRODUCT_TYPE",
] as const;

export type BackfillManualReason = (typeof BACKFILL_MANUAL_REASONS)[number];

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export type ProductBackfillChange = {
  productId: string;
  slug: string;
  name: string;
  /** Product TYPE SLUG the policy was resolved through. */
  productType: string;
  /** Attribute key (the TYPE's spelling) → value to store. */
  set: Record<string, string>;
};

export type ProductBackfillManualReview = {
  productId: string;
  slug: string;
  name: string;
  missingFields: string[];
  /** Why a human is needed — see BACKFILL_MANUAL_REASONS. */
  reasons: BackfillManualReason[];
};

export type ProductBackfillPlan = {
  change: null | ProductBackfillChange;
  manualReview: null | ProductBackfillManualReview;
  /** True when nothing is proposed and nothing needs a human. */
  skipped: boolean;
};

export type CatalogueBackfillSummary = {
  productsScanned: number;
  productsWouldChange: number;
  fieldWrites: number;
  requiresManualReview: number;
  skipped: number;
};

export type CatalogueBackfillPlan = {
  summary: CatalogueBackfillSummary;
  changes: ProductBackfillChange[];
  manualReview: ProductBackfillManualReview[];
};

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const productAttributes = (
  product: ProductWithRelations,
): Record<string, unknown> =>
  typeof product.attributes === "object" && product.attributes !== null
    ? product.attributes
    : {};

/**
 * True when the product already carries a usable value for `field`.
 *
 * Deliberately broader than the Merchant mapper's notion of "present": a stored
 * `"ladies"` is not a valid Google gender, but it IS a human's data and must
 * never be overwritten by a default. Only absent / null / undefined / empty or
 * whitespace-only strings count as fillable.
 */
export function hasStoredAttributeValue(
  product: ProductWithRelations,
  field: BackfillField,
): boolean {
  return findAttributeEntries(
    productAttributes(product),
    FIELD_ALIASES[field],
  ).some(({ value }) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}

/**
 * The key the product TYPE declares for `field`, or null when the type does not
 * define it at all. The type's own spelling is returned, so a type using
 * `age_group` is written as `age_group` and one using `ageGroup` as `ageGroup`.
 */
export function resolveTypeAttributeKey(
  productType: ProductTypeRecord,
  field: BackfillField,
): null | string {
  const wanted = new Set(FIELD_ALIASES[field].map(normaliseAttributeKey));
  const defs = Array.isArray(productType.attributeDefs)
    ? productType.attributeDefs
    : [];

  for (const def of defs) {
    if (typeof def !== "object" || def === null) continue;

    const key = (def as { key?: unknown }).key;
    if (typeof key !== "string") continue;
    if (wanted.has(normaliseAttributeKey(key))) return key;
  }

  return null;
}

/** Product-specific fields still empty — reported, never filled. */
function missingProductSpecificFields(product: ProductWithRelations): string[] {
  const attributes = productAttributes(product);

  return PRODUCT_SPECIFIC_FIELDS.filter(
    (field) =>
      !findAttributeEntries(attributes, ATTRIBUTE_KEYS[field]).some(
        ({ value }) => typeof value === "string" && value.trim().length > 0,
      ),
  );
}

const identity = (product: ProductWithRelations) => ({
  name: product.name,
  productId: product.id,
  slug: product.slug,
});

// ---------------------------------------------------------------------------
// Per-product plan
// ---------------------------------------------------------------------------

/**
 * Plan the backfill for ONE product.
 *
 * @param productType the row referenced by `product.typeId`, or null when the
 *   product has no type or its type could not be resolved — in which case the
 *   product is failed closed into manual review, never guessed at.
 *
 * Inventory status is deliberately ignored: a sold saree may be restocked, and
 * these defaults are catalogue-level facts. Stock is never modified.
 */
export function planProductBackfill(
  product: ProductWithRelations,
  productType: null | ProductTypeRecord,
): ProductBackfillPlan {
  const productSpecific = missingProductSpecificFields(product);

  if (!productType || !BACKFILL_POLICIES[productType.slug]) {
    return {
      change: null,
      manualReview: {
        ...identity(product),
        missingFields: productSpecific,
        reasons: ["UNKNOWN_PRODUCT_TYPE"],
      },
      skipped: false,
    };
  }

  const policy = BACKFILL_POLICIES[productType.slug];
  const set: Record<string, string> = {};
  const undefinedKeys: BackfillField[] = [];

  for (const field of BACKFILL_FIELD_ORDER) {
    const value = policy[field];
    if (value === undefined) continue;

    // Existing values always win — checked before anything else.
    if (hasStoredAttributeValue(product, field)) continue;

    const attributeKey = resolveTypeAttributeKey(productType, field);
    if (!attributeKey) {
      undefinedKeys.push(field);
      continue;
    }

    set[attributeKey] = value;
  }

  const reasons: BackfillManualReason[] = [];
  if (undefinedKeys.length > 0) reasons.push("TYPE_ATTRIBUTE_NOT_DEFINED");
  if (productSpecific.length > 0) {
    reasons.push("PRODUCT_SPECIFIC_VALUE_REQUIRED");
  }

  return {
    change:
      Object.keys(set).length > 0
        ? { ...identity(product), productType: productType.slug, set }
        : null,
    manualReview:
      reasons.length > 0
        ? {
            ...identity(product),
            missingFields: [...undefinedKeys, ...productSpecific],
            reasons,
          }
        : null,
    skipped: Object.keys(set).length === 0 && reasons.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Catalogue plan
// ---------------------------------------------------------------------------

/**
 * Plan the backfill for a whole catalogue.
 *
 * @param productTypesById every product type row, keyed by id. A product whose
 *   `typeId` is missing from the map is failed closed into manual review.
 *
 * Output order mirrors input order, so repeated previews over unchanged rows
 * produce an identical response.
 */
export function planCatalogueBackfill(
  products: ProductWithRelations[],
  productTypesById: ReadonlyMap<string, ProductTypeRecord>,
): CatalogueBackfillPlan {
  const changes: ProductBackfillChange[] = [];
  const manualReview: ProductBackfillManualReview[] = [];
  let skipped = 0;

  for (const product of products) {
    const productType = product.typeId
      ? (productTypesById.get(product.typeId) ?? null)
      : null;

    const plan = planProductBackfill(product, productType);

    if (plan.change) changes.push(plan.change);
    if (plan.manualReview) manualReview.push(plan.manualReview);
    if (plan.skipped) skipped += 1;
  }

  return {
    changes,
    manualReview,
    summary: {
      fieldWrites: changes.reduce(
        (total, change) => total + Object.keys(change.set).length,
        0,
      ),
      productsScanned: products.length,
      productsWouldChange: changes.length,
      requiresManualReview: manualReview.length,
      skipped,
    },
  };
}

/**
 * Re-validate a planned change against the CURRENT row and type, immediately
 * before writing. Returns null when the change is still safe, or the reason it
 * must be refused.
 *
 * This is the apply path's last line of defence: between preview and apply an
 * admin may have filled the field by hand or edited the type schema.
 */
export function validatePlannedChange(
  change: ProductBackfillChange,
  product: ProductWithRelations,
  productType: null | ProductTypeRecord,
): null | string {
  if (!productType || productType.slug !== change.productType) {
    return "PRODUCT_TYPE_CHANGED";
  }

  const policy = BACKFILL_POLICIES[productType.slug];
  if (!policy) return "UNKNOWN_PRODUCT_TYPE";

  for (const [attributeKey, value] of Object.entries(change.set)) {
    const field = BACKFILL_FIELD_ORDER.filter(
      (candidate) => policy[candidate] !== undefined,
    ).find(
      (candidate) =>
        resolveTypeAttributeKey(productType, candidate) === attributeKey,
    );

    if (!field) return "TYPE_ATTRIBUTE_NOT_DEFINED";
    if (policy[field] !== value) return "VALUE_NOT_IN_POLICY";
    if (hasStoredAttributeValue(product, field)) return "VALUE_ALREADY_SET";
  }

  return null;
}

/**
 * The attributes object to store: the product's current attributes with the
 * planned keys added. Never removes or rewrites an existing entry.
 */
export function mergeBackfillAttributes(
  product: ProductWithRelations,
  change: ProductBackfillChange,
): Record<string, unknown> {
  return { ...productAttributes(product), ...change.set };
}
