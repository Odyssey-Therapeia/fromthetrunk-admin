import type { Metadata } from "next";
import { draftMode } from "next/headers";

import { OurWhyExperience } from "@/components/sections/our-why-experience";
import { getProducts } from "@/lib/data/products";
import { selectStoryNarrativeImages } from "@/lib/story-narrative-images";
import type { Product } from "@/types/domain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Why We Do What We Do",
  description:
    "A voice led story experience about why From the Trunk restores, authenticates, and recirculates pre-loved luxury sarees.",
};

export default async function WhyPage() {
  const { isEnabled: includeDrafts } = await draftMode();
  const result = await getProducts(10, { includeDrafts });
  const products = (result?.docs ?? []) as Product[];
  const images = selectStoryNarrativeImages(products);

  return <OurWhyExperience images={images} />;
}
