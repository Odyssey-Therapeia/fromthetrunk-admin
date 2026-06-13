import type { FieldMapping, ValidationError } from "@/lib/ports/batch-import";

const REQUIRED_FIELDS = ["name", "storyTitle", "pricePaise"];

/** Validate a single row against the product schema. */
export function validateRow(
  rowIndex: number,
  row: Record<string, string>,
  mappings: FieldMapping[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const mapped: Record<string, string> = {};

  // Build mapped data
  for (const mapping of mappings) {
    if (mapping.status !== "mapped") continue;
    mapped[mapping.dbField] = row[mapping.csvColumn] ?? "";
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = mapped[field]?.trim();
    if (!value) {
      errors.push({
        row: rowIndex,
        field,
        value: "",
        message: `Required field "${field}" is missing or empty`,
        severity: "error",
      });
    }
  }

  // Validate price
  const priceValue = mapped.pricePaise?.trim();
  if (priceValue) {
    const num = Number(priceValue);
    if (Number.isNaN(num) || num < 0) {
      errors.push({
        row: rowIndex,
        field: "pricePaise",
        value: priceValue,
        message: "Price must be a non-negative number",
        severity: "error",
      });
    } else if (num > 0 && num < 100000) {
      // Matches the auto-conversion branch in transformRow below so warnings
      // and silent conversions stay in sync.
      errors.push({
        row: rowIndex,
        field: "pricePaise",
        value: priceValue,
        message:
          "Price looks like rupees — will be auto-converted to paise (x100, threshold 100000)",
        severity: "warning",
      });
    }
  }

  // Validate status
  const statusValue = mapped.status?.trim().toLowerCase();
  if (statusValue && statusValue !== "draft" && statusValue !== "published") {
    errors.push({
      row: rowIndex,
      field: "status",
      value: statusValue,
      message: 'Status must be "draft" or "published"',
      severity: "error",
    });
  }

  // Validate stock status
  const stockValue = mapped.stockStatus?.trim().toLowerCase();
  if (
    stockValue &&
    stockValue !== "available" &&
    stockValue !== "reserved" &&
    stockValue !== "sold"
  ) {
    errors.push({
      row: rowIndex,
      field: "stockStatus",
      value: stockValue,
      message: 'Stock status must be "available", "reserved", or "sold"',
      severity: "error",
    });
  }

  return errors;
}

/**
 * Transform a row's data using mappings into a product-creation payload.
 * Handles price conversion from rupees to paise if needed.
 */
export function transformRow(
  row: Record<string, string>,
  mappings: FieldMapping[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (mapping.status !== "mapped") continue;
    const value = row[mapping.csvColumn]?.trim() ?? "";
    if (!value) continue;

    switch (mapping.dbField) {
      case "pricePaise":
      case "originalPricePaise": {
        const num = Number(value);
        // Auto-convert if looks like rupees (< 100000 and not already paise-scale)
        result[mapping.dbField] =
          !Number.isNaN(num) && num > 0 && num < 100000
            ? Math.round(num * 100)
            : Math.round(num);
        break;
      }
      case "featured":
        result[mapping.dbField] =
          value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "yes";
        break;
      default:
        result[mapping.dbField] = value;
    }
  }

  // Defaults
  if (!result.status) result.status = "draft";
  if (!result.stockStatus) result.stockStatus = "available";
  if (!result.storyTitle && result.name) result.storyTitle = result.name;

  return result;
}
