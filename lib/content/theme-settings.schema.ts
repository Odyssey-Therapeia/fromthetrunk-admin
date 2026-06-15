/**
 * P3-07: Theme settings schema - single source of truth for the theme editor form.
 *
 * Consumed by:
 *   - SchemaForm in the admin theme editor UI.
 *   - The Zod validator in the theme API route (saveThemeBodySchema re-exports
 *     the per-token validators here so the route doesn't duplicate logic).
 *
 * Design constraints:
 *   - Palette: 7 editable semantic color tokens (hex strings, text + hex validation).
 *   - Border radius: rem string mapped to --radius.
 *   - Font pair: DEFERRED - font-pair switching requires loading new fonts via
 *     next/font/google (docs/design-system.md Rule 3). The field is omitted until
 *     that packet-level decision is made.
 *   - No new FieldType is introduced - uses "text" (with pattern).
 *   - Adding a new color field here automatically renders in the editor with zero
 *     editor-component changes (D-style - the spec's "D-shape" test).
 */

import { z } from "zod";

import type { FormSchema } from "@/lib/forms/types";

// -- Validators ---------------------------------------------------------------

/** CSS hex color, 3 or 6 digit, case-insensitive. */
export const hexColorZod = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color")
  .optional();

/** Border radius in rem - 0.25 to 2.0. */
export const radiusZod = z
  .string()
  .regex(/^\d+(\.\d+)?rem$/, "Must be a rem value (e.g. 0.75rem)")
  .optional();

// -- FormSchema ---------------------------------------------------------------

export const themeSettingsSchema: FormSchema = {
  fields: {
    "--background": {
      zod: hexColorZod,
      meta: {
        type: "text",
        label: "Background",
        placeholder: "warm cream",
        description: "Page background color. Enter a 3 or 6 digit hex value.",
      },
    },
    "--foreground": {
      zod: hexColorZod,
      meta: {
        type: "text",
        label: "Foreground (text)",
        placeholder: "dark brown",
        description: "Primary text color. Enter a 3 or 6 digit hex value.",
      },
    },
    "--primary": {
      zod: hexColorZod,
      meta: {
        type: "text",
        label: "Primary",
        placeholder: "brand burgundy",
        description: "Primary action/brand color. Enter a 3 or 6 digit hex value.",
      },
    },
    "--primary-foreground": {
      zod: hexColorZod,
      meta: {
        type: "text",
        label: "Primary foreground",
        placeholder: "light cream",
        description: "Text color on primary backgrounds. Enter a 3 or 6 digit hex value.",
      },
    },
    "--accent": {
      zod: hexColorZod,
      meta: {
        type: "text",
        label: "Accent",
        placeholder: "gold highlight",
        description: "Accent / highlight color. Enter a 3 or 6 digit hex value.",
      },
    },
    "--accent-foreground": {
      zod: hexColorZod,
      meta: {
        type: "text",
        label: "Accent foreground",
        placeholder: "pale yellow",
        description: "Text color on accent backgrounds. Enter a 3 or 6 digit hex value.",
      },
    },
    "--border": {
      zod: hexColorZod,
      meta: {
        type: "text",
        label: "Border",
        placeholder: "warm tan",
        description: "Default border/divider color. Enter a 3 or 6 digit hex value.",
      },
    },
    "--radius": {
      zod: radiusZod,
      meta: {
        type: "text",
        label: "Border radius",
        placeholder: "0.75rem",
        description: "Base border-radius - controls all rounded corners site-wide.",
      },
    },
  },
};

// -- API body Zod schema ------------------------------------------------------

/**
 * Zod schema for the POST /theme request body.
 * Uses the same per-token validators defined above so the route reuses them
 * rather than duplicating validation logic.
 */
export const saveThemeBodySchema = z.object({
  tokens: z
    .object({
      "--background": hexColorZod,
      "--foreground": hexColorZod,
      "--primary": hexColorZod,
      "--primary-foreground": hexColorZod,
      "--accent": hexColorZod,
      "--accent-foreground": hexColorZod,
      "--border": hexColorZod,
      "--radius": radiusZod,
    })
    .partial()
    .catchall(z.unknown()),
});
