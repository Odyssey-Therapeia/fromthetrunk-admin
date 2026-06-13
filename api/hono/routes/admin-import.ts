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
      const errors: Array<{ row: number; message: string }> = [];

      // Process in batches of 10
      for (let i = 0; i < cached.rows.length; i++) {
        try {
          const transformed = transformRow(cached.rows[i], mappings as FieldMapping[]);

          // Ensure required fields
          if (!transformed.name || !transformed.storyTitle) {
            throw new Error("Missing required fields: name or storyTitle");
          }

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
            imageMediaIds: [],
            tagIds: [],
          });
          created++;
        } catch (err) {
          failed++;
          errors.push({
            row: i,
            message: err instanceof Error ? err.message : "Unknown error",
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
