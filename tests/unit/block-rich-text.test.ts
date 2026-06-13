/**
 * P3-02: Rich-text block unit tests
 *
 * Verifies:
 * - Rich-text propsSchema accepts valid props
 * - Renderer is callable
 * - editorMeta is correct
 */
import { describe, expect, it } from "vitest";

const { richTextBlock } = await import("@/lib/content/blocks/rich-text");

describe("Rich-text block", () => {
  it("exports correct type discriminant", () => {
    expect(richTextBlock.type).toBe("rich-text");
  });

  it("exports a Renderer function", () => {
    expect(typeof richTextBlock.Renderer).toBe("function");
  });

  it("exports editorMeta with no maxPerPage limit", () => {
    expect(richTextBlock.editorMeta.label).toBe("Rich Text");
    expect(richTextBlock.editorMeta.icon).toBe("text");
    expect(richTextBlock.editorMeta.maxPerPage).toBeUndefined();
  });

  describe("propsSchema", () => {
    it("accepts minimal valid props (body only)", () => {
      const result = richTextBlock.propsSchema.safeParse({
        body: "This is some body text.",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all optional props populated", () => {
      const result = richTextBlock.propsSchema.safeParse({
        eyebrow: "Our Story",
        heading: "The journey begins",
        body: "<p>Rich text content with <strong>markup</strong></p>",
        align: "center",
        maxWidth: "wide",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing body", () => {
      const result = richTextBlock.propsSchema.safeParse({
        heading: "A heading without body",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid align value", () => {
      const result = richTextBlock.propsSchema.safeParse({
        body: "Content",
        align: "justify", // Not in enum
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid maxWidth value", () => {
      const result = richTextBlock.propsSchema.safeParse({
        body: "Content",
        maxWidth: "narrow", // Not in enum
      });
      expect(result.success).toBe(false);
    });

    it("applies default align=left", () => {
      const result = richTextBlock.propsSchema.safeParse({ body: "Content" });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as { align: string };
        expect(data.align).toBe("left");
      }
    });

    it("applies default maxWidth=prose", () => {
      const result = richTextBlock.propsSchema.safeParse({ body: "Content" });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as { maxWidth: string };
        expect(data.maxWidth).toBe("prose");
      }
    });

    it("rejects body exceeding 8000 characters", () => {
      const result = richTextBlock.propsSchema.safeParse({
        body: "x".repeat(8001),
      });
      expect(result.success).toBe(false);
    });

    it("accepts body up to 8000 characters", () => {
      const result = richTextBlock.propsSchema.safeParse({
        body: "x".repeat(8000),
      });
      expect(result.success).toBe(true);
    });

    it("rejects eyebrow exceeding 80 characters", () => {
      const result = richTextBlock.propsSchema.safeParse({
        body: "Content",
        eyebrow: "x".repeat(81),
      });
      expect(result.success).toBe(false);
    });
  });
});
