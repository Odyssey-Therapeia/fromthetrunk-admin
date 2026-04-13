import type { Metadata } from "next";
import { draftMode } from "next/headers";

import { StoryNarrative } from "@/components/sections/story-narrative";
import { getProducts } from "@/lib/data/products";
import { selectStoryNarrativeImages } from "@/lib/story-narrative-images";
import type { Product } from "@/types/domain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Why We Do What We Do",
  description:
    "There's something quietly powerful about a saree. It carries more than fabric — it holds memories, milestones, and moments that once meant everything. From the Trunk was born from a simple, heartfelt belief: these sarees still have stories left to tell.",
};

export default async function WhyPage() {
  const { isEnabled: includeDrafts } = await draftMode();
  const result = await getProducts(10, { includeDrafts });
  const products = (result?.docs ?? []) as Product[];
  const images = selectStoryNarrativeImages(products);

  return <StoryNarrative images={images} />;
}
