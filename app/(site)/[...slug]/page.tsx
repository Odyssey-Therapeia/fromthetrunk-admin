/**
 * P3-03: CMS catch-all RSC page.
 * P3-06: Wired draftMode + signed preview token for draft rendering.
 *
 * Handles any URL segment that Next.js has not matched to a more-specific
 * route (Next.js always prefers specific routes over catch-alls, so existing
 * routes such as /collection/[slug], /checkout, etc. are never intercepted).
 *
 * Security/correctness guards:
 *   - Reserved slugs → notFound() immediately (pure check, no I/O).
 *   - Draft pages → notFound() UNLESS draftMode is enabled AND a valid,
 *     unexpired, slug-bound preview token is present in ?__preview_token.
 *   - Missing pages → notFound().
 *
 * PREVIEW SECURITY (load-bearing, no-draft-leak guard):
 *   The check is: shouldRenderDraft(isDraftModeEnabled, slug, previewToken),
 *   defined and unit-tested in lib/content/preview-token.ts. Both draftMode
 *   being enabled AND a valid slug-bound token must hold simultaneously.
 *   Removing either arm leaks draft content — the gate is mutation-proven in
 *   tests/unit/preview-guard.test.ts.
 *
 * Cache: tagged with `page:<slug>` for targeted invalidation (P3-06).
 * A default revalidate of 3600 s (1 h) is set; publish/unpublish push-
 * invalidate via revalidateTag so stale content is bounded.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
import { unstable_cache } from "next/cache";
import type { ReactNode } from "react";

import { createDrizzleContentStore } from "@/lib/adapters/drizzle-content-store";
import { resolvePage, resolveMetadata } from "@/lib/content/resolve-page";
import { renderBlock } from "@/lib/content/blocks/registry";
import { shouldRenderDraft } from "@/lib/content/preview-token";
import { isReservedSlug } from "@/lib/content/reserved-slugs";

// ── ISR / cache configuration note ───────────────────────────────────────────
// P3-06: Reading searchParams and draftMode() makes the outer RSC dynamic, so
// page-level `revalidate` is not meaningful here. Published-path data is still
// ISR-cached via unstable_cache (tag: "page:<slug>", 3600 s) below, and
// revalidateTag("page:<slug>") is called on publish/unpublish for immediate
// push-invalidation. The preview path (draftMode + valid token) bypasses the
// cache entirely and always serves the latest draft — that's by design.
// Dynamic page is acceptable because the preview gate logic requires it.

// ── Types ────────────────────────────────────────────────────────────────────

interface CmsPageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function joinSlug(segments: string[]): string {
  return segments.join("/");
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: CmsPageProps): Promise<Metadata> {
  const { slug: segments } = await params;
  const slug = joinSlug(segments);
  const store = createDrizzleContentStore();

  // resolveMetadata never throws — returns safe-empty for missing/draft/reserved.
  return resolveMetadata(slug, store);
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function CmsPage({ params, searchParams }: CmsPageProps) {
  const { slug: segments } = await params;
  const slug = joinSlug(segments);

  // Fast-path: reserved slugs never belong to CMS pages.
  if (isReservedSlug(slug)) {
    return notFound();
  }

  const store = createDrizzleContentStore();

  // ── Preview mode check (P3-06) ────────────────────────────────────────────
  // LOAD-BEARING: both draftMode.isEnabled AND a valid preview token must be
  // present. One alone is insufficient. The token is slug-bound (the HMAC
  // includes the slug) so a token for page-A cannot render page-B.
  // shouldRenderDraft encapsulates this gate and is unit/mutation-tested in
  // tests/unit/preview-guard.test.ts — do NOT inline the logic here.
  const { isEnabled: isDraftModeEnabled } = await draftMode();
  const sp = await searchParams;
  const rawToken = sp["__preview_token"];
  const previewToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const isValidPreview = shouldRenderDraft(isDraftModeEnabled, slug, previewToken);

  if (isValidPreview) {
    // Preview path: fetch the DRAFT version directly (bypass ISR cache).
    const page = await store.getPageBySlug(slug);
    if (!page) {
      return notFound();
    }

    // Get the latest version for preview
    const versions = await store.listPageVersions(page.id);
    if (versions.length === 0) {
      return notFound();
    }

    const version = versions[0]; // newest first
    const blocks = version.blocks as Array<{
      type: string;
      props: Record<string, unknown>;
    }>;

    const rendered: ReactNode[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const node = await renderBlock({ type: block.type, props: block.props ?? {} });
      rendered.push(node);
    }

    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          Preview mode — draft content. This URL will expire.
        </div>
        {rendered.map((node, i) => (
          <div key={i}>{node}</div>
        ))}
      </main>
    );
  }

  // ── Public path: published-only (no-draft-leak guard) ─────────────────────
  // Wrapped in unstable_cache with a per-slug tag for P3-06 invalidation.
  const resolved = await unstable_cache(
    () => resolvePage(slug, store),
    [`cms-page-${slug}`],
    {
      tags: [`page:${slug}`],
      revalidate: 3600,
    }
  )();

  if (!resolved) {
    return notFound();
  }

  const { version } = resolved;
  const blocks = version.blocks as Array<{ type: string; props: Record<string, unknown> }>;

  // Render each block in declaration order via the validated dispatch path.
  const rendered: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // renderBlock throws UnknownBlockTypeError / BlockPropsValidationError on
    // invalid blocks — let those bubble as 500s (they indicate corrupt DB data
    // that should not be silently swallowed).
    const node = await renderBlock({ type: block.type, props: block.props ?? {} });
    rendered.push(node);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {rendered.map((node, i) => (
        // React key per block; index is stable (blocks are immutable per version)
        <div key={i}>{node}</div>
      ))}
    </main>
  );
}
