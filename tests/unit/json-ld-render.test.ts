import { describe, expect, it, vi } from "vitest";

import type { Product } from "@/types/domain";

// Mock resolveMediaURL to return the url from the media object
vi.mock("@/lib/media/resolve-media-url", () => ({
  resolveMediaURL: (media: unknown) => {
    if (
      media &&
      typeof media === "object" &&
      "media" in (media as Record<string, unknown>)
    ) {
      const inner = (media as Record<string, unknown>).media as Record<
        string,
        unknown
      >;
      if (inner && typeof inner.url === "string") return inner.url;
    }
    return null;
  },
}));

// Mock getProductDisplayDetails to return a fixture with edge-case chars
vi.mock("@/lib/products/display-details", () => ({
  getProductDisplayDetails: () => ({
    fabric: 'Silk & Co "Premium"',
    colorName: "Red",
    care: [],
    condition: "Pre-loved, quality checked",
    designer: null,
    length: "Standard saree drape",
    width: "Standard saree width",
  }),
}));

// Import AFTER mocks are registered
const { productJsonLd, organizationJsonLd, breadcrumbJsonLd } = await import(
  "@/lib/seo/json-ld"
);

const fixture = {
  name: 'Banarasi "Silk" Saree',
  storyNarrative: "This saree\nhas newlines and </script> tags",
  images: [
    {
      media: { url: "https://cdn.example.com/image.jpg" },
      sortOrder: 0,
    },
  ],
  pricePaise: 1750000,
  stockStatus: "available" as const,
  slug: "banarasi-silk",
  detailsCondition: "Excellent",
} as unknown as Product;

describe("JSON-LD render path", () => {
  describe("productJsonLd", () => {
    it("Test A — roundtrip through JSON.stringify/JSON.parse yields correct @type and name", () => {
      const jsonLd = productJsonLd(fixture);
      // Exactly what the page inserts into the DOM
      const html = JSON.stringify(jsonLd);
      // What the browser would parse
      const parsed = JSON.parse(html);

      expect(parsed["@type"]).toBe("Product");
      expect(parsed.name).toBe(fixture.name);
      expect(typeof parsed.offers.price).toBe("number");
      // description round-trip: newlines and </script> in storyNarrative must survive
      expect(parsed.description).toBe(fixture.storyNarrative);
      // Current behavior: JSON.stringify does not escape </script> — fix tracked separately
      expect(html).toContain("</script>");
    });

    it("Test B — serialised string contains no raw control characters", () => {
      const jsonLd = productJsonLd(fixture);
      const html = JSON.stringify(jsonLd);

      // Verify the \n in storyNarrative was escaped to \\n, not dropped or kept raw
      expect(html).toContain('\\n'); // the JSON-escaped form of the newline

      // No raw control chars (0x00–0x1f) should appear in the JSON string;
      // JSON.stringify escapes them, so the rendered output is safe for the DOM
      expect(html).not.toMatch(/[\x00-\x1f]/);
    });

    it("renders the price as rupees (paisePaise / 100)", () => {
      const jsonLd = productJsonLd(fixture);
      const parsed = JSON.parse(JSON.stringify(jsonLd));
      expect(parsed.offers.price).toBe(17500);
    });

    it("includes InStock availability for available stock", () => {
      const jsonLd = productJsonLd(fixture);
      const parsed = JSON.parse(JSON.stringify(jsonLd));
      expect(parsed.offers.availability).toBe("https://schema.org/InStock");
    });
  });

  describe("organizationJsonLd", () => {
    it("Test C — roundtrip yields correct @type", () => {
      const org = organizationJsonLd();
      const parsed = JSON.parse(JSON.stringify(org));
      expect(parsed["@type"]).toBe("Organization");
    });

    it("includes required fields", () => {
      const org = organizationJsonLd();
      const parsed = JSON.parse(JSON.stringify(org));
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(typeof parsed.name).toBe("string");
    });
  });

  describe("breadcrumbJsonLd", () => {
    it("Test D — roundtrip with edge-case names preserves special chars", () => {
      const items = [
        { name: 'Home & "Garden"', url: "https://www.fromthetrunk.shop" },
        {
          name: "Collection\nSarees",
          url: "https://www.fromthetrunk.shop/collection",
        },
      ];
      const bc = breadcrumbJsonLd(items);
      const parsed = JSON.parse(JSON.stringify(bc));

      expect(parsed["@type"]).toBe("BreadcrumbList");
      expect(parsed.itemListElement).toHaveLength(2);
      expect(parsed.itemListElement[0].name).toBe('Home & "Garden"');
    });

    it("assigns 1-based positions to list items", () => {
      const items = [
        { name: "Home", url: "https://www.fromthetrunk.shop" },
        { name: "Collection", url: "https://www.fromthetrunk.shop/collection" },
      ];
      const bc = breadcrumbJsonLd(items);
      const parsed = JSON.parse(JSON.stringify(bc));
      expect(parsed.itemListElement[0].position).toBe(1);
      expect(parsed.itemListElement[1].position).toBe(2);
    });
  });
});
