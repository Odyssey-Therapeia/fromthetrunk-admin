import { BrandStoryTeaser } from "@/components/sections/brand-story-teaser";
import { FeaturedCollection } from "@/components/sections/featured-collection";
import { HeroSection } from "@/components/sections/hero-section";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Newsletter } from "@/components/sections/newsletter";
import { getFeaturedProducts, getGlobals, getProducts } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/payload";

export default async function Home() {
  const [homePage, featuredProducts, allProducts] = await Promise.all([
    getGlobals("homePage"),
    getFeaturedProducts(4),
    getProducts(6),
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
