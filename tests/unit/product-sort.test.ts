import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRODUCT_SORT,
  getProductSortLabel,
  parseProductSort,
  PRODUCT_SORT_OPTIONS,
} from "@/lib/products/sort";

describe("product sort helpers", () => {
  it("defaults to newest arrivals when sort is missing", () => {
    expect(parseProductSort(undefined)).toBe(DEFAULT_PRODUCT_SORT);
  });

  it("uses the first sort value when multiple params are present", () => {
    expect(
      parseProductSort(["price-high-to-low", "price-low-to-high"])
    ).toBe("price-high-to-low");
  });

  it("falls back to newest arrivals for unsupported values", () => {
    expect(parseProductSort("featured")).toBe(DEFAULT_PRODUCT_SORT);
  });

  it("exposes price sorting choices for the collection page", () => {
    expect(PRODUCT_SORT_OPTIONS).toEqual([
      { label: "Newest arrivals", value: "latest" },
      { label: "Price: Low to High", value: "price-low-to-high" },
      { label: "Price: High to Low", value: "price-high-to-low" },
    ]);
  });

  it("returns the active sort label for UI copy", () => {
    expect(getProductSortLabel("price-low-to-high")).toBe("Price: Low to High");
  });
});
