/**
 * P3-02: Hero block unit tests
 *
 * Verifies:
 * - Hero propsSchema accepts all valid prop combinations
 * - Renderer is callable with validated props
 */
import { describe, expect, it } from "vitest";

const { heroBlock } = await import("@/lib/content/blocks/hero");

describe("Hero block", () => {
  it("exports correct type discriminant", () => {
    expect(heroBlock.type).toBe("hero");
  });

  it("exports a Renderer function", () => {
    expect(typeof heroBlock.Renderer).toBe("function");
  });

  it("exports editorMeta with maxPerPage=1", () => {
    expect(heroBlock.editorMeta.label).toBe("Hero");
    expect(heroBlock.editorMeta.icon).toBe("layout-panel-top");
    expect(heroBlock.editorMeta.maxPerPage).toBe(1);
  });

  describe("propsSchema", () => {
    it("accepts minimal props (only headline required)", () => {
      const result = heroBlock.propsSchema.safeParse({
        headline: "Welcome to From the Trunk",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all optional props populated", () => {
      const result = heroBlock.propsSchema.safeParse({
        eyebrow: "From the Trunk",
        headline: "Pre-loved luxury sarees",
        subtitle: "Authenticated and restored with care",
        backgroundImage: "123e4567-e89b-12d3-a456-426614174000",
        primaryCtaLabel: "Explore the Collection",
        primaryCtaHref: "/collection",
        secondaryCtaLabel: "Read the Story",
        secondaryCtaHref: "/our-story",
        infoCardEyebrow: "New Arrivals",
        infoCardTitle: "Curated designer sarees",
        infoCardBody: "Limited drops every fortnight",
        minHeight: "80vh",
      });
      expect(result.success).toBe(true);
    });

    it("accepts backgroundImage as a draft-safe string value", () => {
      const result = heroBlock.propsSchema.safeParse({
        headline: "Test",
        backgroundImage: "not-a-uuid",
      });
      expect(result.success).toBe(true);
    });

    it("rejects eyebrow exceeding 80 characters", () => {
      const result = heroBlock.propsSchema.safeParse({
        headline: "Test",
        eyebrow: "x".repeat(81),
      });
      expect(result.success).toBe(false);
    });

    it("rejects headline exceeding 200 characters", () => {
      const result = heroBlock.propsSchema.safeParse({
        headline: "x".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it("applies default minHeight of 90vh", () => {
      const result = heroBlock.propsSchema.safeParse({ headline: "Test" });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as { minHeight: string };
        expect(data.minHeight).toBe("90vh");
      }
    });

    it("accepts all valid minHeight enum values", () => {
      for (const value of ["60vh", "80vh", "90vh", "100vh"]) {
        const result = heroBlock.propsSchema.safeParse({
          headline: "Test",
          minHeight: value,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
