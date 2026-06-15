/**
 * P5-06: llms.txt — AEO (Answer-Engine Optimization) convention.
 *
 * Served at /llms.txt with content-type text/plain.
 * Derived from REAL content: listProducts + published static pages.
 * Absolute URLs via getSiteOrigin().
 *
 * llms.txt convention: https://llmstxt.org/
 *  - A short site description at the top.
 *  - ## Sections with links to key pages.
 *  - One URL per line in each section.
 *
 * This route is force-dynamic so it always reflects the current product
 * catalogue without needing a rebuild.
 */

import { listProducts } from "@/db/queries/products";
import { getSiteOrigin } from "@/lib/config/site";

export const dynamic = "force-dynamic";

const STATIC_PAGES = [
  { title: "Home", path: "/" },
  { title: "Collection", path: "/collection" },
  { title: "Our Story", path: "/our-story" },
  { title: "How It Works", path: "/how-it-works" },
  { title: "FAQs", path: "/faqs" },
  { title: "Return Policy", path: "/return-policy" },
  { title: "Shipping Policy", path: "/shipping-policy" },
  { title: "Privacy Policy", path: "/privacy-policy" },
  { title: "Terms of Service", path: "/terms-of-service" },
] as const;

export async function GET(): Promise<Response> {
  const origin = getSiteOrigin();

  const { rows: products } = await listProducts({
    includeDrafts: false,
    limit: 200,
    offset: 0,
  });

  const lines: string[] = [
    "# From the Trunk",
    "",
    "> From the Trunk is a curated marketplace for authenticated, pre-loved luxury",
    "> sarees — each piece carries provenance, history, and a story.",
    "> We specialise in one-of-one preloved pieces from renowned Indian weaving traditions.",
    "",
    "## Key pages",
    "",
    ...STATIC_PAGES.map((page) => `- [${page.title}](${origin}${page.path})`),
    "",
    "## Products",
    "",
    ...products.map(
      (p) => `- [${p.name}](${origin}/collection/${p.slug})`
    ),
  ];

  const body = lines.join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Cache for 1 hour in CDN; revalidate in background
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
