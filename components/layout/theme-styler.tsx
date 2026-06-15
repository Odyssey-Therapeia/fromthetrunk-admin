/**
 * P3-07: ThemeStyler — server component that injects theme CSS overrides.
 *
 * Reads the active theme_settings from the content store (cached, no-waterfall)
 * and emits a <style> tag with :root { … } custom-property overrides.
 *
 * When no theme is saved (or tokens is empty), returns null so the DOM is
 * not mutated — the site renders byte-identical to today using globals.css.
 *
 * This is the ONLY place where DB-sourced theme tokens enter the render tree.
 * Consuming components use var(--primary) etc. — they never know the source.
 */

import { cache } from "react";

import { buildInlineStyle } from "@/lib/content/theme-tokens";

// Cached fetch — deduped across the render tree within a single request.
const fetchThemeSettings = cache(async () => {
  try {
    const { createDrizzleContentStore } = await import(
      "@/lib/adapters/drizzle-content-store"
    );
    const store = createDrizzleContentStore();
    return await store.getThemeSettings();
  } catch {
    // Never let a theme DB error break the site render.
    return null;
  }
});

export async function ThemeStyler() {
  const theme = await fetchThemeSettings();
  if (!theme) return null;

  const css = buildInlineStyle(theme.tokens);
  if (!css) return null;

  // dangerouslySetInnerHTML is safe here: tokens come from the admin DB
  // (only admins can write) and only valid CSS var names (starting with "--")
  // are emitted by buildInlineStyle — no user-supplied strings reach this output.
  return (
    <style
      dangerouslySetInnerHTML={{ __html: css }}
      data-theme-source="db"
    />
  );
}
