import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { Product } from "@/types/domain";

export const STORY_NARRATIVE_IMAGE_COUNT = 5;
export const STORY_NARRATIVE_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1679006831648-7c9ea12e5807?q=80&w=2000&auto=format&fit=crop";

export function selectStoryNarrativeImages(
  products: Product[],
  count = STORY_NARRATIVE_IMAGE_COUNT,
): string[] {
  const images = products
    .map((product) => resolveMediaURL(product.images?.[0]))
    .filter((image): image is string => Boolean(image))
    .slice(0, count);

  while (images.length < count) {
    images.push(STORY_NARRATIVE_FALLBACK_IMAGE);
  }

  return images;
}
