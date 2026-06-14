import type { Metadata } from "next";
import type { ReactNode } from "react";
import { draftMode } from "next/headers";

import { FeaturedCollection } from "@/components/sections/featured-collection";
import { HeroSection } from "@/components/sections/hero-section";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Newsletter } from "@/components/sections/newsletter";
import { StoryNarrative } from "@/components/sections/story-narrative";
import { TrustSignals } from "@/components/sections/trust-signals";
import { isBlocksHomepage } from "@/lib/config/flags";
import { getFeaturedProducts, getGlobals, getProducts } from "@/lib/data/products";
import { selectStoryNarrativeImages } from "@/lib/story-narrative-images";
import type { Product } from "@/types/domain";
import type { HomePageContent } from "@/types/site-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "From the Trunk | Pre-Loved Luxury Sarees with Provenance",
  description:
    "Curated collection of authenticated, pre-loved luxury sarees. Each one-of-a-kind piece comes with provenance, a story woven in silk, and careful restoration.",
};

const homeCoverImage = "/media/home-cover.png";

export default async function Home() {
  const { isEnabled: includeDrafts } = await draftMode();

  // ── FLAG ON: render homepage via the block-content engine ──────────────────
  // When FTT_FEATURE_BLOCKS_HOMEPAGE=true, the homepage is rendered by mapping
  // HOMEPAGE_BLOCKS through the REAL renderBlock dispatcher (the same engine
  // used by the public CMS page renderer at app/(site)/[...slug]/page.tsx).
  // This is the P3-10 proof-of-concept: the block system renders a REAL page.
  if (isBlocksHomepage()) {
    // Lazy-load so the flag-off code path has zero cost from these imports.
    const { renderBlock } = await import("@/lib/content/blocks/registry");
    const { HOMEPAGE_BLOCKS } = await import(
      "@/lib/content/seed/homepage-blocks"
    );

    const rendered: ReactNode[] = [];
    for (let i = 0; i < HOMEPAGE_BLOCKS.length; i++) {
      const block = HOMEPAGE_BLOCKS[i];
      const node = await renderBlock({
        type: block.type,
        props: block.props,
      });
      rendered.push(node);
    }

    return (
      <div className="flex flex-col pb-24">
        {rendered.map((node, i) => (
          // React key per block; index is stable (blocks are immutable per fixture)
          <div key={i}>{node}</div>
        ))}
      </div>
    );
  }

  // ── FLAG OFF: HARDCODED homepage JSX (default / production path) ───────────
  // The hardcoded homepage JSX is RETIRED BEHIND THE FLAG, not deleted.
  // This code path is byte-identical to the pre-P3-10 homepage.
  const [homePage, featuredProducts, allProducts] = await Promise.all([
    getGlobals("homePage", { includeDrafts }),
    getFeaturedProducts(4, { includeDrafts }),
    getProducts(6, { includeDrafts }),
  ]);

  const cms = homePage as HomePageContent | null;
  const heroContent = {
    ...cms,
    heroImage: homeCoverImage,
  };

  const featuredDocs = (featuredProducts?.docs ?? []) as Product[];
  const allDocs = (allProducts?.docs ?? []) as Product[];
  const productFallback = featuredDocs.length ? featuredDocs : allDocs;

  const narrativePool = allDocs.length >= 5 ? allDocs : [...allDocs, ...featuredDocs];
  const narrativeImages = selectStoryNarrativeImages(narrativePool);

  return (
    <div className="flex flex-col gap-20 pb-24">
      <HeroSection content={heroContent} />
      <StoryNarrative images={narrativeImages} embedded />
      <TrustSignals />
      <FeaturedCollection products={featuredDocs} content={cms} />
      <HowItWorks products={productFallback} />
      <Newsletter />
    </div>
  );
}
