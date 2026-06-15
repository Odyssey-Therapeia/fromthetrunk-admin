/**
 * P3-07: Theme token helpers.
 *
 * Pure functions - no DB, no React. Used by:
 *   - ThemeStyler RSC (app/(site)/layout.tsx injection)
 *   - admin theme editor live-preview
 *   - tests (mutation-proofs)
 *
 * Token keys MUST start with "--" to be valid CSS custom properties.
 * Any key not starting with "--" is silently ignored, making the data
 * store safely accumulate non-CSS metadata if needed in the future.
 *
 * NOTE: Font-pair switching is deferred. The only loaded fonts are
 * Cormorant Garamond (--font-serif) and Inter (--font-sans), loaded in
 * app/(site)/layout.tsx via next/font/google. Adding a new font pair
 * requires updating that layout and is a separate packet-level decision
 * per docs/design-system.md Rule 3.
 */

/** Sentinel prefix for valid CSS custom property names. */
export const THEME_CSS_VAR_PREFIX = "--" as const;

/**
 * Converts a theme token map to a CSS custom-property declarations string.
 *
 * Only keys starting with "--" are emitted.
 * Returns "" when tokens is empty - the site renders byte-identical to today.
 *
 * Example: formatThemeCssVariables({ "--primary": "warm-burgundy" })
 * emits "--primary: warm-burgundy;" as a CSS declaration.
 */
export function formatThemeCssVariables(
  tokens: Record<string, unknown>
): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (!key.startsWith(THEME_CSS_VAR_PREFIX)) continue;
    if (value === null || value === undefined) continue;
    lines.push(`${key}: ${String(value)};`);
  }
  return lines.join("\n");
}

/**
 * Wraps the token declarations in a :root { ... } block suitable for injection
 * via a <style> tag in the root layout.
 *
 * Returns "" when tokens is empty so the DOM is not mutated at all -
 * the site falls back to the globals.css defaults unchanged.
 */
export function buildInlineStyle(tokens: Record<string, unknown>): string {
  const declarations = formatThemeCssVariables(tokens);
  if (!declarations) return "";
  return `:root {\n${declarations}\n}`;
}

/**
 * The editable semantic color token names.
 *
 * We expose only the 7 core semantic tokens (not chart or sidebar palette)
 * so the admin form stays manageable. The Tailwind @theme inline mapping in
 * globals.css propagates these to --color-* automatically.
 */
export const EDITABLE_COLOR_TOKENS = [
  "--background",
  "--foreground",
  "--primary",
  "--primary-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
] as const;

export type EditableColorToken = (typeof EDITABLE_COLOR_TOKENS)[number];
