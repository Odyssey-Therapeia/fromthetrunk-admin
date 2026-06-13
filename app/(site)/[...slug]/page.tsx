/**
 * P3-03: CMS catch-all RSC page.
 *
 * Handles any URL segment that Next.js has not matched to a more-specific
 * route (Next.js always prefers specific routes over catch-alls, so existing
 * routes such as /collection/[slug], /checkout, etc. are never intercepted).
 *
 * Security/correctness guards:
 *   - Reserved slugs → notFound() immediately (pure check, no I/O).
 *   - Draft pages → notFound() (NEVER rendered publicly).
 *   - Missing pages → notFound().
 *
 * Cache: tagged with `page:<slug>` for targeted invalidation (P3-06 wiring).
 * A default revalidate of 3600 s (1 h) is set; P3-06 will push-invalidate
 * on publish so stale content is not a concern in practice.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { ReactNode } from "react";

import { createDrizzleContentStore } from "@/lib/adapters/drizzle-content-store";
import { resolvePage, resolveMetadata } from "@/lib/content/resolve-page";
import { renderBlock } from "@/lib/content/blocks/registry";

// ── ISR / cache configuration ─────────────────────────────────────────────────
// P3-06 will wire revalidateTag("page:<slug>") on publish.
// Fallback: revalidate once per hour so stale pages are bounded.
export const revalidate = 3600;

// ── Types ────────────────────────────────────────────────────────────────────

interface CmsPageProps {
  params: Promise<{ slug: string[] }>;
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

export default async function CmsPage({ params }: CmsPageProps) {
  const { slug: segments } = await params;
  const slug = joinSlug(segments);

  const store = createDrizzleContentStore();

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
