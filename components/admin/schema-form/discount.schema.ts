/**
 * components/admin/schema-form/discount.schema.ts
 *
 * FormSchema for the admin discount code create/edit form (P6-02).
 * Driven by SchemaForm — no hand-assembled field metadata at call sites.
 *
 * Field conventions:
 *   - code: text, stored UPPER-case
 *   - type: select (percent | fixed)
 *   - value: number — for percent = 0–100 (integer percent points);
 *             for fixed = rupees (UI input), converted to paise on submit.
 *   - minSubtotalRupees: number — rupees, converted to paise on submit.
 *   - startsAt / endsAt: text (datetime-local ISO string or blank).
 *   - usageLimit: number (optional, blank = unlimited).
 *
 * Submit handler in the admin page converts rupee fields to paise and
 * iso strings to Date before sending to /api/v2/admin/discounts.
 */

import { z } from "zod";

import type { FormSchema } from "@/lib/forms/types";

export const discountFormSchema: FormSchema = {
  fields: {
    code: {
      zod: z.string().min(1, "Code is required").max(64),
      meta: {
        type: "text",
        label: "Discount code",
        placeholder: "SAVE10",
        description: "Stored and compared in uppercase. Customers can enter in any case.",
      },
    },
    type: {
      zod: z.enum(["percent", "fixed"]),
      meta: {
        type: "select",
        label: "Discount type",
        options: [
          { label: "Percent off (%)", value: "percent" },
          { label: "Fixed amount (₹)", value: "fixed" },
        ],
      },
    },
    value: {
      zod: z.coerce.number().min(0, "Value must be ≥ 0"),
      meta: {
        type: "number",
        label: "Discount value",
        placeholder: "10",
        description: "Percent (0–100) for percent type; rupees for fixed type.",
      },
    },
    minSubtotalRupees: {
      zod: z.coerce.number().min(0).optional(),
      meta: {
        type: "number",
        label: "Min order amount (₹, optional)",
        placeholder: "0",
        description: "Leave blank or 0 for no minimum.",
      },
    },
    startsAt: {
      zod: z.string().max(30).optional(),
      meta: {
        type: "text",
        label: "Active from (optional)",
        placeholder: "YYYY-MM-DDTHH:MM",
        description: "ISO datetime or blank. Leave blank for immediate activation.",
      },
    },
    endsAt: {
      zod: z.string().max(30).optional(),
      meta: {
        type: "text",
        label: "Expires at (optional)",
        placeholder: "YYYY-MM-DDTHH:MM",
        description: "ISO datetime or blank. Leave blank for no expiry.",
      },
    },
    usageLimit: {
      zod: z.coerce.number().int().min(1).optional(),
      meta: {
        type: "number",
        label: "Usage limit (optional)",
        placeholder: "Unlimited",
        description: "Leave blank for unlimited redemptions.",
      },
    },
    collectionId: {
      zod: z.string().uuid().optional().or(z.literal("")).optional(),
      meta: {
        type: "text",
        label: "Collection ID (optional)",
        placeholder: "UUID or blank for no scope",
        description: "When set, discount applies only to items in this collection.",
      },
    },
  },
};

/**
 * Full-width keys for the discount form grid layout.
 * Keys not in this set render in the default 2-column grid.
 */
export const discountFormFullWidthKeys = new Set(["code"]);
