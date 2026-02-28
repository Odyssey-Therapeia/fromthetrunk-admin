import { describe, expect, it } from "vitest";

import { resolveMediaURL } from "@/lib/media/resolve-media-url";

describe("resolveMediaURL", () => {
  it("returns null for missing values", () => {
    expect(resolveMediaURL(null)).toBeNull();
    expect(resolveMediaURL(undefined)).toBeNull();
  });

  it("returns direct URL strings as-is", () => {
    expect(resolveMediaURL("/media/example.jpg")).toBe("/media/example.jpg");
    expect(resolveMediaURL("https://cdn.example.com/image.jpg")).toBe(
      "https://cdn.example.com/image.jpg"
    );
  });

  it("prefers object url when available", () => {
    expect(resolveMediaURL({ url: "/media/object.jpg" })).toBe("/media/object.jpg");
  });

  it("falls back to card size url", () => {
    expect(
      resolveMediaURL({
        filename: "item.jpg",
        sizes: { card: { url: "/media/item-card.jpg" } },
      })
    ).toBe("/media/item-card.jpg");
  });

  it("returns null for unrecognized values", () => {
    expect(resolveMediaURL("media-id-without-slash")).toBeNull();
    expect(resolveMediaURL({ filename: "item.jpg" })).toBeNull();
  });
});
