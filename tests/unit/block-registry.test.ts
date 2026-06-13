/**
 * P3-02: Block registry unit tests
 *
 * Verifies:
 * - getBlock(unknownType) throws / returns undefined for unknown types
 * - renderBlock() throws on unknown type (never renders arbitrary output)
 * - renderBlock() throws if props fail propsSchema validation
 * - renderBlock() succeeds for valid props against a registered block
 */
import { describe, expect, it, vi } from "vitest";

// Mock DB and product data layer — registry imports product-grid which imports
// lib/data/products which imports db/index which throws without DATABASE_URL.
vi.mock("@/lib/data/products", () => ({
  getFeaturedProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductsByCollection: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductBySlug: vi.fn().mockResolvedValue(null),
}));

// Mock next/image and next/link (RSC component deps not available in node env)
vi.mock("next/image", () => ({
  default: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

// Mock UI components used by the block renderers
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/product/product-card", () => ({
  ProductCard: () => null,
}));
vi.mock("@/lib/media/resolve-media-url", () => ({
  resolveMediaURL: () => null,
}));

// Import AFTER mocks are registered
const { getBlock, renderBlock, BLOCK_REGISTRY } = await import(
  "@/lib/content/blocks/registry"
);

describe("Block registry — closed registry contract", () => {
  it("BLOCK_REGISTRY is a Map", () => {
    expect(BLOCK_REGISTRY).toBeInstanceOf(Map);
  });

  it("getBlock returns entry for a known type", () => {
    const entry = getBlock("hero");
    expect(entry).toBeDefined();
    expect(entry?.type).toBe("hero");
    expect(typeof entry?.Renderer).toBe("function");
    expect(entry?.propsSchema).toBeDefined();
    expect(entry?.editorMeta).toBeDefined();
  });

  it("getBlock returns undefined for an unknown type", () => {
    const entry = getBlock("totally-unknown-block-type-xyz");
    expect(entry).toBeUndefined();
  });

  it("renderBlock throws for an unknown block type", async () => {
    await expect(
      renderBlock({ type: "totally-unknown-block-type-xyz", props: {} })
    ).rejects.toThrow(/unknown block type/i);
  });

  it("renderBlock throws when props fail propsSchema validation for hero (headline required)", async () => {
    await expect(
      renderBlock({
        type: "hero",
        props: {
          // headline is required — omitting it must cause validation failure
          eyebrow: "Valid eyebrow",
        },
      })
    ).rejects.toThrow();
  });

  it("renderBlock throws when props fail propsSchema validation for rich-text (body required)", async () => {
    await expect(
      renderBlock({
        type: "rich-text",
        props: {
          eyebrow: "Some heading",
          // body is required — missing
        },
      })
    ).rejects.toThrow();
  });

  it("renderBlock throws when props fail propsSchema validation for product-grid (source required)", async () => {
    await expect(
      renderBlock({
        type: "product-grid",
        props: {
          heading: "Some heading",
          // source is required — missing
        },
      })
    ).rejects.toThrow();
  });
});

describe("Block registry — propsSchema validates on save (standalone validation)", () => {
  it("hero propsSchema rejects missing headline", () => {
    const entry = getBlock("hero");
    expect(entry).toBeDefined();
    const result = entry!.propsSchema.safeParse({
      eyebrow: "Test eyebrow",
      // headline: missing
    });
    expect(result.success).toBe(false);
  });

  it("hero propsSchema accepts valid props", () => {
    const entry = getBlock("hero");
    const result = entry!.propsSchema.safeParse({
      headline: "Welcome to the trunk",
      eyebrow: "From the Trunk",
      subtitle: "Authentic pre-loved sarees",
    });
    expect(result.success).toBe(true);
  });

  it("hero propsSchema rejects invalid minHeight enum", () => {
    const entry = getBlock("hero");
    const result = entry!.propsSchema.safeParse({
      headline: "Test",
      minHeight: "50vh", // Not in enum
    });
    expect(result.success).toBe(false);
  });

  it("hero propsSchema applies default minHeight", () => {
    const entry = getBlock("hero");
    const result = entry!.propsSchema.safeParse({
      headline: "Test",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { minHeight: string };
      expect(data.minHeight).toBe("90vh");
    }
  });

  it("rich-text propsSchema rejects missing body", () => {
    const entry = getBlock("rich-text");
    expect(entry).toBeDefined();
    const result = entry!.propsSchema.safeParse({
      heading: "A heading",
    });
    expect(result.success).toBe(false);
  });

  it("rich-text propsSchema accepts valid props", () => {
    const entry = getBlock("rich-text");
    const result = entry!.propsSchema.safeParse({
      body: "This is the body text with enough content.",
      align: "left",
      maxWidth: "prose",
    });
    expect(result.success).toBe(true);
  });

  it("rich-text propsSchema rejects invalid align value", () => {
    const entry = getBlock("rich-text");
    const result = entry!.propsSchema.safeParse({
      body: "Content",
      align: "right", // Not in enum
    });
    expect(result.success).toBe(false);
  });

  it("product-grid propsSchema rejects missing source", () => {
    const entry = getBlock("product-grid");
    expect(entry).toBeDefined();
    const result = entry!.propsSchema.safeParse({
      heading: "Featured Products",
    });
    expect(result.success).toBe(false);
  });

  it("product-grid propsSchema accepts valid props with source=featured", () => {
    const entry = getBlock("product-grid");
    const result = entry!.propsSchema.safeParse({
      source: "featured",
      heading: "Featured Products",
      limit: 4,
    });
    expect(result.success).toBe(true);
  });

  it("product-grid propsSchema rejects invalid source enum value", () => {
    const entry = getBlock("product-grid");
    const result = entry!.propsSchema.safeParse({
      source: "bestsellers", // Not in enum
    });
    expect(result.success).toBe(false);
  });

  it("product-grid propsSchema rejects limit out of range", () => {
    const entry = getBlock("product-grid");
    const result = entry!.propsSchema.safeParse({
      source: "featured",
      limit: 15, // max is 12
    });
    expect(result.success).toBe(false);
  });

  it("product-grid propsSchema rejects non-UUID in productIds", () => {
    const entry = getBlock("product-grid");
    const result = entry!.propsSchema.safeParse({
      source: "manual",
      productIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});

describe("Block registry — editorMeta shape", () => {
  it("hero editorMeta has correct label and maxPerPage=1", () => {
    const entry = getBlock("hero");
    expect(entry!.editorMeta.label).toBe("Hero");
    expect(entry!.editorMeta.maxPerPage).toBe(1);
    expect(typeof entry!.editorMeta.icon).toBe("string");
  });

  it("rich-text editorMeta has correct label and unlimited maxPerPage", () => {
    const entry = getBlock("rich-text");
    expect(entry!.editorMeta.label).toBe("Rich Text");
    expect(entry!.editorMeta.maxPerPage).toBeUndefined();
  });

  it("product-grid editorMeta has correct label and unlimited maxPerPage", () => {
    const entry = getBlock("product-grid");
    expect(entry!.editorMeta.label).toBe("Product Grid");
    expect(entry!.editorMeta.maxPerPage).toBeUndefined();
  });
});
