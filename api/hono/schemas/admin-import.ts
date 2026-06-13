import { z } from "@hono/zod-openapi";

export const suggestMappingsSchema = z.object({
  headers: z.array(z.string()),
});

export const fieldMappingSchema = z.object({
  csvColumn: z.string(),
  dbField: z.string(),
  confidence: z.number(),
  status: z.enum(["mapped", "unmapped", "skipped"]),
});

export const validateRowsSchema = z.object({
  fileId: z.string(),
  mappings: z.array(fieldMappingSchema),
});

export const executeImportSchema = z.object({
  fileId: z.string(),
  mappings: z.array(fieldMappingSchema),
});
