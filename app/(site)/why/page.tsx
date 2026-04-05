import type { Metadata } from "next";
import { draftMode } from "next/headers";

import { StoryNarrative } from "@/components/sections/story-narrative";
import { getProducts } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { Product } from "@/types/domain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Why We Do What We Do",
  description:
    "There's something quietly powerful about a saree. It carries more than fabric — it holds memories, milestones, and moments that once meant everything. From the Trunk was born from a simple, heartfelt belief: these sarees still have stories left to tell.",
};

export default async function WhyPage() {
  const { isEnabled: includeDrafts } = await draftMode();
  const result = await getProducts(4, { includeDrafts });
  const products = (result?.docs ?? []) as Product[];

  const images = products
    .map((p) => resolveMediaURL(p.images?.[0]))
    .filter(Boolean) as string[];

  while (images.length < 4) {
    images.push(
      "https://images.unsplash.com/photo-1679006831648-7c9ea12e5807?q=80&w=2000&auto=format&fit=crop"
    );
  }

  return <StoryNarrative images={images} />;
}
