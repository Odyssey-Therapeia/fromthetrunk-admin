import type { FieldMapping } from "@/lib/ports/batch-import";

/** DB fields that can be mapped from CSV columns. */
export const DB_FIELDS = [
  "name",
  "slug",
  "pricePaise",
  "originalPricePaise",
  "storyTitle",
  "storyNarrative",
  "storyProvenance",
  "storyEra",
  "detailsFabric",
  "detailsLength",
  "detailsWidth",
  "detailsCondition",
  "detailsDesigner",
  "status",
  "stockStatus",
  "featured",
  "collectionId",
  // P4-06: type-aware import
  "typeId",
] as const;

type DbField = (typeof DB_FIELDS)[number];

/**
 * Prefix used for attribute column dbField values in the mapping layer.
 * A mapping with dbField "attributes_fabric" means: read the CSV column value
 * and store it under attributes["fabric"] for the product being imported.
 * These are NOT in DB_FIELDS (that is a static list of known fields) — they
 * are generated dynamically from the product type's attribute_defs at
 * column-mapping time. The import /execute route recognises this prefix.
 */
export const ATTRIBUTES_PREFIX = "attributes_";

/**
 * Build the dbField value for a given attribute key.
 * e.g. attrDbField("fabric") → "attributes_fabric"
 */
export const attrDbField = (key: string): string => `${ATTRIBUTES_PREFIX}${key}`;

/** Known aliases for each DB field, used for fuzzy matching. */
const FIELD_ALIASES: Record<DbField, string[]> = {
  name: ["name", "product name", "title", "product title", "product"],
  slug: ["slug", "url slug", "url", "handle"],
  pricePaise: ["price", "price paise", "pricepaise", "price (paise)", "price_paise", "amount"],
  originalPricePaise: ["original price", "original_price", "mrp", "compare at price", "compare price"],
  storyTitle: ["story title", "story_title", "storytitle", "heading"],
  storyNarrative: ["story", "narrative", "description", "story narrative", "body"],
  storyProvenance: ["provenance", "origin", "story provenance"],
  storyEra: ["era", "period", "story era", "age", "vintage"],
  detailsFabric: ["fabric", "material", "details fabric", "cloth"],
  detailsLength: ["length", "details length", "size length"],
  detailsWidth: ["width", "details width", "size width"],
  detailsCondition: ["condition", "details condition", "state"],
  detailsDesigner: ["designer", "artisan", "weaver", "details designer"],
  status: ["status", "product status", "visibility"],
  stockStatus: ["stock", "stock status", "availability", "stock_status"],
  featured: ["featured", "is featured", "highlight"],
  collectionId: ["collection", "collection id", "category", "collection_id"],
  // P4-06: product type
  typeId: ["type", "type id", "typeid", "product type", "type_id"],
};

/** Normalize a string for comparison: lowercase, strip whitespace/underscores/hyphens. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

/** Auto-map CSV headers to DB fields using fuzzy matching. */
export function autoMapFields(csvHeaders: string[]): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const usedDbFields = new Set<string>();

  for (const header of csvHeaders) {
    const normalized = normalize(header);

    // ── P4-06: Auto-detect attribute columns ──────────────────────────────
    // Headers prefixed "attr_" or "attributes_" (matching the export format)
    // are mapped directly to "attributes_<key>" so the import route can collect
    // them into the attributes object. These bypass the fuzzy-alias matching.
    const attrPrefixMatch =
      /^attr_(.+)$/i.exec(header) ?? /^attributes?_(.+)$/i.exec(header);
    if (attrPrefixMatch) {
      const key = attrPrefixMatch[1]!;
      const dbField = attrDbField(key);
      // attributes_ dbField values are unique per key — no usedDbFields check needed
      mappings.push({
        csvColumn: header,
        dbField,
        confidence: 1.0,
        status: "mapped",
      });
      continue;
    }
    // ─────────────────────────────────────────────────────────────────────

    let bestMatch: DbField | null = null;
    let bestConfidence = 0;

    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
      [DbField, string[]]
    >) {
      if (usedDbFields.has(field)) continue;

      for (const alias of aliases) {
        const aliasNorm = normalize(alias);

        // Exact match
        if (normalized === aliasNorm) {
          bestMatch = field;
          bestConfidence = 1.0;
          break;
        }

        // Contains match -- guard against short-header false positives like
        // a one-letter header matching a long alias. Require substantial
        // length overlap before accepting either direction of `contains`.
        const lenRatio =
          Math.min(aliasNorm.length, normalized.length) /
          Math.max(aliasNorm.length, normalized.length);
        if (
          lenRatio >= 0.5 &&
          (normalized.includes(aliasNorm) || aliasNorm.includes(normalized))
        ) {
          if (lenRatio > bestConfidence) {
            bestMatch = field;
            bestConfidence = lenRatio;
          }
        }
      }

      if (bestConfidence === 1.0) break;
    }

    if (bestMatch && bestConfidence >= 0.4) {
      usedDbFields.add(bestMatch);
      mappings.push({
        csvColumn: header,
        dbField: bestMatch,
        confidence: Math.round(bestConfidence * 100) / 100,
        status: "mapped",
      });
    } else {
      mappings.push({
        csvColumn: header,
        dbField: "",
        confidence: 0,
        status: "unmapped",
      });
    }
  }

  return mappings;
}
