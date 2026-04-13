import { describe, expect, it } from "vitest";

import {
  STORY_NARRATIVE_FALLBACK_IMAGE,
  selectStoryNarrativeImages,
} from "@/lib/story-narrative-images";
import type { Product } from "@/types/domain";

const makeProduct = (image?: unknown) =>
  ({
    images: image ? [{ media: image }] : [],
  }) as Product;

describe("selectStoryNarrativeImages", () => {
  it("skips products without valid images before truncating", () => {
    const images = selectStoryNarrativeImages([
      makeProduct(null),
      makeProduct({ url: "/media/first.jpg" }),
      makeProduct(undefined),
      makeProduct({ url: "/media/second.jpg" }),
      makeProduct({ url: "/media/third.jpg" }),
      makeProduct({ url: "/media/fourth.jpg" }),
      makeProduct({ url: "/media/fifth.jpg" }),
    ]);

    expect(images).toEqual([
      "/media/first.jpg",
      "/media/second.jpg",
      "/media/third.jpg",
      "/media/fourth.jpg",
      "/media/fifth.jpg",
    ]);
  });

  it("pads with the fallback image when there are not enough valid URLs", () => {
    const images = selectStoryNarrativeImages([
      makeProduct({ url: "/media/one.jpg" }),
      makeProduct(null),
      makeProduct({ url: "/media/two.jpg" }),
    ]);

    expect(images).toEqual([
      "/media/one.jpg",
      "/media/two.jpg",
      STORY_NARRATIVE_FALLBACK_IMAGE,
      STORY_NARRATIVE_FALLBACK_IMAGE,
      STORY_NARRATIVE_FALLBACK_IMAGE,
    ]);
  });
});
