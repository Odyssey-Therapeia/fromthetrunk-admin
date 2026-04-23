import type { Metadata } from "next";
import { draftMode } from "next/headers";

import { FeaturedCollection } from "@/components/sections/featured-collection";
import { HeroSection } from "@/components/sections/hero-section";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Newsletter } from "@/components/sections/newsletter";
import { StoryNarrative } from "@/components/sections/story-narrative";
import { TrustSignals } from "@/components/sections/trust-signals";
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
