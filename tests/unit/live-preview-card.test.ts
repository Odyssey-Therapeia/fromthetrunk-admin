import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LivePreviewCard } from "@/components/admin/product-stepper/live-preview-card";
import { defaultStepperValues } from "@/components/admin/product-stepper/types";

const renderCard = (
  valueOverrides: Partial<typeof defaultStepperValues> = {},
  imageUrls: Array<{ id: string; url: string }> = []
) =>
  renderToStaticMarkup(
    createElement(LivePreviewCard as unknown as (props: Record<string, unknown>) => React.JSX.Element, {
      imageUrls,
      values: {
        ...defaultStepperValues,
        ...valueOverrides,
      },
    })
  );

describe("LivePreviewCard", () => {
  it("prefers the internal name over the story title", () => {
    const html = renderCard({
      name: "Kanjeevaram Silk - Gold Border",
      storyTitle: "Autumn Story Title",
    });

    expect(html).toContain("Kanjeevaram Silk - Gold Border");
  });

  it("renders the first uploaded image and image count", () => {
    const html = renderCard(
      {
        name: "Rose Saree",
      },
      [
        {
          id: "media-1",
          url: "https://cdn.example.com/cover.jpg",
        },
        {
          id: "media-2",
          url: "https://cdn.example.com/detail.jpg",
        },
      ]
    );

    expect(html).toContain("https%3A%2F%2Fcdn.example.com%2Fcover.jpg");
    expect(html).toContain("1 of 2");
  });

  it("shows the original price styling and status badge", () => {
    const html = renderCard({
      originalPriceRupees: 18000,
      priceRupees: 12000,
      status: "published",
    });

    expect(html).toContain("Published");
    expect(html).toContain("line-through");
  });
});
