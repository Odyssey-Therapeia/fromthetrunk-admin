import type { Metadata } from "next";
import type { ReactNode } from "react";
import { draftMode } from "next/headers";

import { CampaignBannerSection } from "@/components/sections/campaign-banner-section";
import { FabricCategorySection } from "@/components/sections/fabric-category-section";
import { FloatingReviewTab } from "@/components/sections/floating-review-tab";
import { HeroSection } from "@/components/sections/hero-section";
import { HomeIntroGate } from "@/components/sections/home-intro-gate";
import {
  LandingSections,
  type LandingProductCard,
} from "@/components/sections/landing-sections";
import { isBlocksHomepage } from "@/lib/config/flags";
import {
  getFeaturedProducts,
  getGlobals,
  getProducts,
} from "@/lib/data/products";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getProductDisplayDetails } from "@/lib/products/display-details";
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
    const { HOMEPAGE_BLOCKS } =
      await import("@/lib/content/seed/homepage-blocks");

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

  const narrativePool =
    allDocs.length >= 5 ? allDocs : [...allDocs, ...featuredDocs];
  const narrativeImages = selectStoryNarrativeImages(narrativePool);
  const landingProductSource = [
    ...featuredDocs,
    ...allDocs.filter(
      (product) => !featuredDocs.some((featured) => featured.id === product.id),
    ),
  ];
  const landingProducts: LandingProductCard[] = landingProductSource
    .map((product) => {
      const image = resolveMediaURL(product.images?.[0]);
      if (!image) return null;

      const details = getProductDisplayDetails(product);
      return {
        name: product.name,
        href: `/collection/${product.slug}`,
        image,
        detail: [product.storyEra, details.fabric].filter(Boolean).join(" • "),
        condition:
          product.storyProvenance?.trim() ||
          details.condition ||
          "Authenticated, restored, and ready for its next chapter",
        price: formatCurrency(product.pricePaise / 100),
      };
    })
    .filter((product): product is LandingProductCard => Boolean(product))
    .slice(0, 6);

  const storyImages = narrativeImages.map((src, index) => ({
    src,
    alt: `Curated From The Trunk saree ${index + 1}`,
    title:
      [
        "Authenticated with provenance",
        "Restored with care",
        "Styled for modern wardrobes",
        "Chosen one at a time",
        "Ready for its next story",
      ][index] ?? "Curated with care",
  }));

  return (
    <HomeIntroGate>
      <div className="bg-[#F8F4EF]">
        <HeroSection content={heroContent} />
        <FloatingReviewTab />
        <FabricCategorySection />
        <CampaignBannerSection />
        <LandingSections
          featuredProducts={landingProducts}
          showIntroSeparator={false}
          storyImages={storyImages}
        />
      </div>
    </HomeIntroGate>
  );
}
