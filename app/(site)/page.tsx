import { draftMode } from "next/headers";

import { BrandStoryTeaser } from "@/components/sections/brand-story-teaser";
import { FeaturedCollection } from "@/components/sections/featured-collection";
import { HeroSection } from "@/components/sections/hero-section";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Newsletter } from "@/components/sections/newsletter";
import { getFeaturedProducts, getGlobals, getProducts } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { isEnabled: includeDrafts } = await draftMode();

  const [homePage, featuredProducts, allProducts] = await Promise.all([
    getGlobals("homePage", { includeDrafts }),
    getFeaturedProducts(4, { includeDrafts }),
    getProducts(6, { includeDrafts }),
  ]);

  const heroImage = resolveMediaURL(homePage?.heroImage);
  const heroContent = {
    ...homePage,
    heroImage: heroImage ?? undefined,
  };

  const featuredDocs = featuredProducts?.docs ?? [];
  const productFallback = featuredDocs.length ? featuredDocs : allProducts?.docs ?? [];

  return (
    <div className="flex flex-col gap-20 pb-24">
      <HeroSection content={heroContent} />
      <FeaturedCollection products={featuredDocs} content={homePage} />
      <BrandStoryTeaser />
      <HowItWorks products={productFallback} />
      <Newsletter />
    </div>
  );
}
