import { afterEach, describe, expect, it, vi } from "vitest";

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
const { productJsonLd, organizationJsonLd, breadcrumbJsonLd, safeJsonLd } =
  await import("@/lib/seo/json-ld");

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
    it("Test A — roundtrip through safeJsonLd/JSON.parse yields correct @type and name", () => {
      const jsonLd = productJsonLd(fixture);
      // Exactly what the page now inserts into the DOM
      const html = safeJsonLd(jsonLd);
      // What the browser's JSON parser would produce after the HTML parser delivers the script text
      const parsed = JSON.parse(html);

      expect(parsed["@type"]).toBe("Product");
      expect(parsed.name).toBe(fixture.name);
      expect(typeof parsed.offers.price).toBe("number");
      // description round-trip: newlines and </script> in storyNarrative must survive parsing
      expect(parsed.description).toBe(fixture.storyNarrative);
      // The raw HTML must not contain </script> — that sequence would close the tag early
      expect(html).not.toContain("</script>");
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

  // ──────────────────────────────────────────────────────────────────────────
  // GST-inclusive flag (P2-04): valueAddedTaxIncluded must reflect isGstInclusive()
  // so the structured-data claim stays consistent with the charged total.
  // ──────────────────────────────────────────────────────────────────────────
  describe("productJsonLd — GST-inclusive flag", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("OFF (default): omits valueAddedTaxIncluded (price is exclusive)", () => {
      vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", "false");
      const jsonLd = productJsonLd(fixture);
      const parsed = JSON.parse(JSON.stringify(jsonLd));

      // No inclusive claim when the flag is off — GST is added on top elsewhere.
      expect(parsed.offers).not.toHaveProperty("valueAddedTaxIncluded");
      // Price is still the listed price in rupees.
      expect(parsed.offers.price).toBe(fixture.pricePaise / 100);
    });

    it("OFF when env var absent: omits valueAddedTaxIncluded", () => {
      vi.unstubAllEnvs();
      delete process.env.FTT_FEATURE_GST_INCLUSIVE;
      const jsonLd = productJsonLd(fixture);
      const parsed = JSON.parse(JSON.stringify(jsonLd));
      expect(parsed.offers).not.toHaveProperty("valueAddedTaxIncluded");
    });

    it("ON: marks valueAddedTaxIncluded true and price is the all-in price", () => {
      vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", "true");
      const jsonLd = productJsonLd(fixture);
      const parsed = JSON.parse(JSON.stringify(jsonLd));

      // Inclusive: the listed pricePaise IS the all-in price; declare it.
      expect(parsed.offers.valueAddedTaxIncluded).toBe(true);
      expect(parsed.offers.price).toBe(fixture.pricePaise / 100);
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

  describe("safeJsonLd", () => {
    it("escapes < so </script> cannot close the enclosing script tag", () => {
      const html = safeJsonLd({ xss: "</script><script>alert(1)</script>" });
      expect(html).not.toContain("</script>");
      expect(html).toContain("\\u003c");
    });

    it("round-trips through JSON.parse — < is restored from \\u003c", () => {
      const input = { description: "has </script> inside" };
      const parsed = JSON.parse(safeJsonLd(input));
      expect(parsed.description).toBe(input.description);
    });

    it("escapes < anywhere in the value, not just in </script>", () => {
      const html = safeJsonLd({ tag: "<b>bold</b>" });
      expect(html).not.toMatch(/<b>/);
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
