/**
 * Pure helpers for PDP title and description meta generation.
 * Extracted so they can be tested in isolation without any Next.js context.
 */

/**
 * Build the <title> for a product detail page.
 *
 * Format: `{name} | Preloved {fabric} Saree`
 *
 * Redundancy guard: when the product name already ends with "{fabric} saree"
 * (case-insensitive) the suffix is omitted to avoid repetition.
 *
 * The brand segment (" | From the Trunk") is appended by the layout template
 * and must NOT be added here.
 */
export function buildPdpTitle(name: string, fabric: string): string {
  // Normalize fabric: strip any trailing " saree" (case-insensitive) to avoid
  // double-saree output when the fabric value already contains the word "saree"
  // (e.g. "Heirloom saree" → "Heirloom").
  const fabricDisplay = fabric.replace(/\s+saree\s*$/i, "").trim() || fabric;

  const suffix = `${fabricDisplay} Saree`;
  const endsWithSuffix = new RegExp(`${escapeRegex(suffix)}\\s*$`, "i");

  if (endsWithSuffix.test(name)) {
    return name;
  }

  return `${name} | Preloved ${suffix}`;
}

/**
 * Build the meta description for a product detail page.
 *
 * Fallback chain (first truthy source wins):
 *   1. storyNarrative  — truncated at word boundary ≤150 chars
 *   2. storyTitle
 *   3. `{name} {fabric} saree`
 *
 * Word-boundary truncation: if the source is longer than 150 chars, find the
 * last space at or before position 150 and cut there. If the source is ≤150
 * chars it is returned whole.
 */
export function buildPdpDescription(
  name: string,
  fabric: string,
  storyNarrative?: null | string,
  storyTitle?: null | string,
): string {
  if (storyNarrative && storyNarrative.trim().length > 0) {
    return truncateAtWordBoundary(storyNarrative.trim(), 150);
  }

  if (storyTitle && storyTitle.trim().length > 0) {
    return storyTitle.trim();
  }

  return `${name} ${fabric} saree`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  // Find the last space at or before maxLen
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");

  if (lastSpace === -1) {
    // No space found — hard-cut at maxLen rather than returning the whole string
    return slice;
  }

  return slice.slice(0, lastSpace);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
