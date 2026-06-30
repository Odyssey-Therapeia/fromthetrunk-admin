import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LivePreviewCard } from "@/components/admin/product-stepper/live-preview-card";
import { defaultStepperValues } from "@/components/admin/product-stepper/types";

const renderCard = (
  valueOverrides: Partial<typeof defaultStepperValues> = {},
  imageUrls: Array<{ id: string; url: string }> = [],
  options: { defaultExpanded?: boolean } = {}
) =>
  renderToStaticMarkup(
    createElement(LivePreviewCard as unknown as (props: Record<string, unknown>) => React.JSX.Element, {
      defaultExpanded: options.defaultExpanded,
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

  it("renders the first uploaded image in expanded preview", () => {
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
      ],
      { defaultExpanded: true }
    );

    expect(html).toContain("https%3A%2F%2Fcdn.example.com%2Fcover.jpg");
    expect(html).toContain("ftt-product-card");
  });

  it("shows the original price styling and status badge", () => {
    const html = renderCard(
      {
        originalPriceRupees: 18000,
        priceRupees: 12000,
        status: "published",
      },
      [],
      { defaultExpanded: true }
    );

    expect(html).toContain("Published");
    expect(html).toContain("line-through");
  });

  it("shows a sold availability badge", () => {
    const html = renderCard(
      {
        stockStatus: "sold",
      },
      [],
      { defaultExpanded: true }
    );

    expect(html).toContain("Sold");
  });
});
