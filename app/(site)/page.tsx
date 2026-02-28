import type { Metadata } from "next";
import { draftMode } from "next/headers";

import { BrandStoryTeaser } from "@/components/sections/brand-story-teaser";
import { FeaturedCollection } from "@/components/sections/featured-collection";
import { HeroSection } from "@/components/sections/hero-section";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Newsletter } from "@/components/sections/newsletter";
import { TrustSignals } from "@/components/sections/trust-signals";
import { getFeaturedProducts, getGlobals, getProducts } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { HomePageGlobal, Product } from "@/types/payload-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "From the Trunk | Pre-Loved Luxury Sarees with Provenance",
  description:
    "Curated collection of authenticated, pre-loved luxury sarees. Each one-of-a-kind piece comes with provenance, a story woven in silk, and careful restoration.",
};

export default async function Home() {
  const { isEnabled: includeDrafts } = await draftMode();

  const [homePage, featuredProducts, allProducts] = await Promise.all([
    getGlobals("homePage", { includeDrafts }),
    getFeaturedProducts(4, { includeDrafts }),
    getProducts(6, { includeDrafts }),
  ]);

  const cms = homePage as unknown as HomePageGlobal | null;
  const heroImage = resolveMediaURL(cms?.heroImage);
  const heroContent = {
    ...cms,
    heroImage: heroImage ?? undefined,
  };

  const featuredDocs = (featuredProducts?.docs ?? []) as unknown as Product[];
  const allDocs = (allProducts?.docs ?? []) as unknown as Product[];
  const productFallback = featuredDocs.length ? featuredDocs : allDocs;

  return (
    <div className="flex flex-col gap-20 pb-24">
      <HeroSection content={heroContent} />
      <TrustSignals />
      <FeaturedCollection products={featuredDocs} content={cms} />
      <BrandStoryTeaser />
      <HowItWorks products={productFallback} />
      <Newsletter />
    </div>
  );
}
