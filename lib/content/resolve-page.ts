/**
 * P3-03: Testable page-resolution helper.
 *
 * Encapsulates the lookup logic for the CMS catch-all route so it can be
 * unit-tested without Next.js machinery.
 *
 * - Reserved slugs short-circuit immediately (pure check, no I/O).
 * - Draft / missing pages return null.
 * - Published pages return { page, version }.
 * - resolveMetadata extracts title/description/openGraph from page.seo for a
 *   published page, or returns safe-empty metadata for missing/draft/reserved.
 */

import type { Metadata } from "next";

import type { ContentStore, Page, PageVersion } from "@/lib/ports/content-store";
import { isReservedSlug } from "@/lib/content/reserved-slugs";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedPage {
  page: Page;
  version: PageVersion;
}

// ── resolvePage ───────────────────────────────────────────────────────────────

/**
 * Resolves a CMS page for the given slug using the provided ContentStore.
 *
 * Returns `null` when:
 *   - the slug is reserved (exact match against RESERVED_SLUGS)
 *   - no page exists for the slug
 *   - the page is in draft status (not yet published)
 *
 * Callers should map `null` to `notFound()`.
 */
export async function resolvePage(
  slug: string,
  store: ContentStore
): Promise<ResolvedPage | null> {
  // Fast-path: reserved slugs never belong to CMS pages.
  if (isReservedSlug(slug)) {
    return null;
  }

  const result = await store.getPublishedPage(slug);
  if (!result) {
    return null;
  }

  return result;
}

// ── resolveMetadata ───────────────────────────────────────────────────────────

/**
 * Extracts Next.js Metadata from a published page's seo field.
 *
 * Returns safe-empty metadata (title: "") when the page is missing,
 * draft, or reserved — never throws.
 */
export async function resolveMetadata(
  slug: string,
  store: ContentStore
): Promise<Metadata> {
  const resolved = await resolvePage(slug, store);

  if (!resolved) {
    return { title: "" };
  }

  const seo = resolved.page.seo ?? {};
  const title = typeof seo.title === "string" ? seo.title : "";
  const description =
    typeof seo.description === "string" ? seo.description : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      ...(description ? { description } : {}),
    },
  };
}
