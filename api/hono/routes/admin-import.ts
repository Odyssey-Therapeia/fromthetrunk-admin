import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import {
  executeImportSchema,
  suggestMappingsSchema,
  validateRowsSchema,
} from "@/api/hono/schemas/admin-import";
import { requireAdmin } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import { parseCSV } from "@/lib/import/file-parser";
import { autoMapFields } from "@/lib/import/field-mapper";
import { validateRow, transformRow } from "@/lib/import/row-validator";
import { createProduct } from "@/db/queries/products";
import { getProductTypeById } from "@/db/queries/product-types";
import { buildTypeZodSchema } from "@/lib/catalog/type-schema";
import type { AttributeDef } from "@/lib/catalog/type-schema";
import { slugify } from "@/lib/utils";
import type { FieldMapping, ImportPreviewRow } from "@/lib/ports/batch-import";

// In-memory cache for parsed file data (keyed by fileId, TTL 30 min)
const fileCache = new Map<
  string,
  { rows: Record<string, string>[]; headers: string[]; expires: number }
>();

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of fileCache) {
    if (value.expires < now) fileCache.delete(key);
  }
}

/** Fetch a cache entry and purge it if expired, returning null on miss/expiry. */
function getValidCachedFile(fileId: string) {
  const entry = fileCache.get(fileId);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    fileCache.delete(fileId);
    return null;
  }
  return entry;
}

export const registerAdminImportRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // Parse uploaded file
  app.openapi(
    createRoute({
      method: "post",
      path: "/parse",
      responses: { 200: { description: "Parsed file" } },
      tags: ["Admin Import"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const formData = await c.req.raw.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return c.json({ code: "NO_FILE", message: "No file uploaded" }, 400);
      }

      const text = await file.text();
      const parsed = parseCSV(text);

      if (parsed.headers.length === 0) {
        return c.json(
          { code: "EMPTY_FILE", message: "File has no headers" },
          400,
        );
      }

      const fileId = crypto.randomUUID();
      cleanExpiredCache();
      fileCache.set(fileId, {
        rows: parsed.rows,
        headers: parsed.headers,
        expires: Date.now() + 30 * 60 * 1000,
      });

      return c.json(
        {
          fileId,
          headers: parsed.headers,
          previewRows: parsed.rows.slice(0, 10),
          totalRows: parsed.rows.length,
        },
        200,
      );
    },
  );

  // Suggest mappings
  app.openapi(
    createRoute({
      method: "post",
      path: "/map",
      request: {
        body: {
          content: { "application/json": { schema: suggestMappingsSchema } },
          required: true,
        },
      },
      responses: { 200: { description: "Field mappings" } },
      tags: ["Admin Import"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { headers } = c.req.valid("json");
      const mappings = autoMapFields(headers);
      return c.json({ mappings }, 200);
    },
  );

  // Validate rows
  app.openapi(
    createRoute({
      method: "post",
      path: "/validate",
      request: {
        body: {
          content: { "application/json": { schema: validateRowsSchema } },
          required: true,
        },
      },
      responses: { 200: { description: "Validation results" } },
      tags: ["Admin Import"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { fileId, mappings } = c.req.valid("json");
      const cached = getValidCachedFile(fileId);
      if (!cached) {
        return c.json(
          { code: "FILE_EXPIRED", message: "File data expired. Re-upload." },
          400,
        );
      }

      const results: ImportPreviewRow[] = cached.rows.map((row, i) => {
        const errors = validateRow(i, row, mappings as FieldMapping[]);
        const hasErrors = errors.some((e) => e.severity === "error");
        const hasWarnings = errors.some((e) => e.severity === "warning");
        return {
          rowIndex: i,
          data: row,
          errors,
          status: hasErrors ? "error" : hasWarnings ? "warning" : "valid",
        };
      });

      return c.json({ rows: results }, 200);
    },
  );

  // Execute import
  app.openapi(
    createRoute({
      method: "post",
      path: "/execute",
      request: {
        body: {
          content: { "application/json": { schema: executeImportSchema } },
          required: true,
        },
      },
      responses: { 200: { description: "Import result" } },
      tags: ["Admin Import"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { fileId, mappings } = c.req.valid("json");
      const cached = getValidCachedFile(fileId);
      if (!cached) {
        return c.json(
          { code: "FILE_EXPIRED", message: "File data expired. Re-upload." },
          400,
        );
      }

      let created = 0;
      let failed = 0;
      const errors: Array<{ row: number; message: string; field?: string }> = [];

      for (let i = 0; i < cached.rows.length; i++) {
        try {
          const transformed = transformRow(cached.rows[i], mappings as FieldMapping[]);

          // Ensure required fields
          if (!transformed.name || !transformed.storyTitle) {
            throw new Error("Missing required fields: name or storyTitle");
          }

          // ── P4-06: Type-aware attribute validation ──────────────────────
          // Extract typeId from the transformed row (mapped via "typeId" dbField).
          const typeId =
            typeof transformed.typeId === "string" && transformed.typeId.length > 0
              ? transformed.typeId
              : null;

          // Collect attributes from columns prefixed "attributes_" (dbField convention)
          // and from a standalone "attributes" JSON column (if the mapper chose it).
          const rawAttributes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(transformed)) {
            if (key.startsWith("attributes_")) {
              const attrKey = key.slice("attributes_".length);
              if (attrKey && value !== "" && value !== undefined) {
                rawAttributes[attrKey] = value;
              }
            }
          }

          // Validate attributes against type schema BEFORE persist
          if (typeId) {
            const productType = await getProductTypeById(typeId);
            if (!productType) {
              throw new Error(`Product type not found: ${typeId}`);
            }

            const attributeDefs = (productType.attributeDefs ?? []) as AttributeDef[];
            if (attributeDefs.length > 0) {
              // ── P4-06: Coerce CSV strings to the types expected by buildTypeZodSchema ──
              // CSV values arrive as strings; we convert to the JS type that the schema
              // expects so that numeric/boolean attributes validate and persist correctly.
              const coercedAttributes: Record<string, unknown> = { ...rawAttributes };
              for (const def of attributeDefs) {
                const raw = coercedAttributes[def.key];
                if (raw === undefined || raw === "") continue;
                const strVal = String(raw);

                switch (def.meta.type) {
                  case "number":
                  case "money-paise": {
                    const num = Number(strVal);
                    if (Number.isNaN(num)) {
                      const err = new Error(
                        `Invalid attribute "${def.key}": expected a number, got "${strVal}"`
                      );
                      (err as Error & { field?: string }).field = def.key;
                      throw err;
                    }
                    coercedAttributes[def.key] =
                      def.meta.type === "money-paise" ? Math.round(num) : num;
                    break;
                  }
                  case "boolean": {
                    coercedAttributes[def.key] =
                      strVal.toLowerCase() === "true" ||
                      strVal === "1" ||
                      strVal.toLowerCase() === "yes";
                    break;
                  }
                  case "multi-select": {
                    // Round-trips with the export's "|" join separator
                    coercedAttributes[def.key] = strVal
                      .split("|")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    break;
                  }
                  case "image-ref": {
                    if (def.meta.multiple) {
                      coercedAttributes[def.key] = strVal
                        .split("|")
                        .map((s) => s.trim())
                        .filter(Boolean);
                    }
                    break;
                  }
                  default:
                    // text, textarea, rich-text, select, list-of-group, conditional —
                    // keep as string; the schema will validate the value.
                    break;
                }
              }
              // ─────────────────────────────────────────────────────────────────

              const schema = buildTypeZodSchema(attributeDefs);
              const parseResult = schema.safeParse(coercedAttributes);
              if (!parseResult.success) {
                const firstIssue = parseResult.error.issues[0];
                const fieldPath = firstIssue?.path.join(".") ?? "attribute";
                const message = firstIssue?.message ?? "Invalid attribute value";
                const err = new Error(`Invalid attribute "${fieldPath}": ${message}`);
                // Attach field info for structured error reporting
                (err as Error & { field?: string }).field = fieldPath;
                throw err;
              }
              // Replace rawAttributes with the coerced+validated version for persist
              Object.assign(rawAttributes, coercedAttributes);
            }
          }
          // ────────────────────────────────────────────────────────────────

          await createProduct({
            name: String(transformed.name),
            slug:
              typeof transformed.slug === "string" && transformed.slug.length > 0
                ? transformed.slug
                : slugify(String(transformed.name)),
            pricePaise: Number(transformed.pricePaise) || 0,
            originalPricePaise:
              transformed.originalPricePaise
                ? Number(transformed.originalPricePaise)
                : null,
            storyTitle: String(transformed.storyTitle),
            storyNarrative:
              typeof transformed.storyNarrative === "string"
                ? transformed.storyNarrative
                : null,
            storyProvenance:
              typeof transformed.storyProvenance === "string"
                ? transformed.storyProvenance
                : null,
            storyEra:
              typeof transformed.storyEra === "string" ? transformed.storyEra : null,
            detailsFabric:
              typeof transformed.detailsFabric === "string"
                ? transformed.detailsFabric
                : null,
            detailsLength:
              typeof transformed.detailsLength === "string"
                ? transformed.detailsLength
                : null,
            detailsWidth:
              typeof transformed.detailsWidth === "string"
                ? transformed.detailsWidth
                : null,
            detailsCondition:
              typeof transformed.detailsCondition === "string"
                ? transformed.detailsCondition
                : null,
            detailsDesigner:
              typeof transformed.detailsDesigner === "string"
                ? transformed.detailsDesigner
                : null,
            status: transformed.status === "published" ? "published" : "draft",
            stockStatus:
              transformed.stockStatus === "reserved"
                ? "reserved"
                : transformed.stockStatus === "sold"
                  ? "sold"
                  : "available",
            featured: transformed.featured === true,
            collectionId:
              typeof transformed.collectionId === "string"
                ? transformed.collectionId
                : null,
            // P4-06: persist typeId + validated attributes
            typeId: typeId ?? undefined,
            attributes: typeId ? rawAttributes : undefined,
            imageMediaIds: [],
            tagIds: [],
          });
          created++;
        } catch (err) {
          failed++;
          const errorObj = err instanceof Error ? err : new Error("Unknown error");
          errors.push({
            row: i,
            message: errorObj.message,
            field: (errorObj as Error & { field?: string }).field,
          });
        }
      }

      // Clean up cached file
      fileCache.delete(fileId);

      return c.json(
        {
          total: cached.rows.length,
          created,
          failed,
          errors,
        },
        200,
      );
    },
  );
};
