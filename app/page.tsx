import { BrandStoryTeaser } from "@/components/sections/brand-story-teaser";
import { FeaturedCollection } from "@/components/sections/featured-collection";
import { HeroSection } from "@/components/sections/hero-section";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Newsletter } from "@/components/sections/newsletter";

export default function Home() {
  return (
    <div className="flex flex-col gap-20 pb-24">
      <HeroSection />
      <FeaturedCollection />
      <BrandStoryTeaser />
      <HowItWorks />
      <Newsletter />
    </div>
  );
}
