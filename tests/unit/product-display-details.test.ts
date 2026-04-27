import { describe, expect, it } from "vitest";

import { getProductDisplayDetails } from "@/lib/products/display-details";

describe("getProductDisplayDetails", () => {
  it("uses explicit product details when they are present", () => {
    const details = getProductDisplayDetails({
      detailsCondition: "Excellent",
      detailsDesigner: "Heritage House",
      detailsFabric: "Pure silk",
      detailsLength: "5.5 m",
      detailsWidth: "44 in",
    });

    expect(details).toEqual({
      condition: "Excellent",
      designer: "Heritage House",
      fabric: "Pure silk",
      length: "5.5 m",
      width: "44 in",
    });
  });

  it("infers known fabric families from product copy and tags", () => {
    const details = getProductDisplayDetails({
      name: "Temple Border Archive",
      storyTitle: "A Kanjeevaram from the family trunk",
      tags: [{ name: "wedding" }],
    });

    expect(details.fabric).toBe("Kanjeevaram silk");
  });

  it("fills storefront-safe defaults instead of leaving product details blank", () => {
    const details = getProductDisplayDetails({});

    expect(details).toEqual({
      condition: "Pre-loved, quality checked",
      designer: null,
      fabric: "Heirloom saree",
      length: "Standard saree drape",
      width: "Standard saree width",
    });
  });
});
