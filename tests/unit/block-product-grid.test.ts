/**
 * P3-02: Product-grid block unit tests
 *
 * Verifies:
 * - propsSchema validates all field constraints
 * - Renderer is callable
 * - editorMeta is correct
 * - Product query functions are mocked and called with correct args
 */
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/domain";

// Build a minimal mock product matching ProductWithRelations shape
const makeMockProduct = (id: string, slug: string): Product =>
  ({
    id,
    slug,
    name: `Product ${slug}`,
    pricePaise: 500000,
    originalPricePaise: null,
    stockStatus: "available",
    detailsFabric: "Silk",
    storyTitle: "A story from the trunk",
    images: [
      {
        media: { url: `https://cdn.example.com/${slug}.jpg`, id: "media-1" },
        sortOrder: 0,
      },
    ],
    collection: null,
    tags: [],
  } as unknown as Product);

// Mock the product data functions
vi.mock("@/lib/data/products", () => ({
  getFeaturedProducts: vi.fn().mockResolvedValue({
    docs: [
      makeMockProduct("id-1", "banarasi-silk"),
      makeMockProduct("id-2", "kanjivaram-gold"),
      makeMockProduct("id-3", "chanderi-cotton"),
      makeMockProduct("id-4", "mysore-silk"),
    ],
    totalDocs: 4,
  }),
  getProductsByCollection: vi.fn().mockResolvedValue({
    docs: [
      makeMockProduct("id-1", "banarasi-silk"),
      makeMockProduct("id-2", "kanjivaram-gold"),
    ],
    totalDocs: 2,
  }),
  getProducts: vi.fn().mockResolvedValue({
    docs: [makeMockProduct("id-1", "banarasi-silk")],
    totalDocs: 1,
  }),
  getProductBySlug: vi
    .fn()
    .mockResolvedValue(makeMockProduct("id-1", "banarasi-silk")),
  // P4-03 REPAIR / P3-02a: source=manual resolves UUIDs by id, not by slug.
  getProductsByIds: vi
    .fn()
    .mockResolvedValue([
      makeMockProduct("123e4567-e89b-12d3-a456-426614174000", "banarasi-silk"),
      makeMockProduct("123e4567-e89b-12d3-a456-426614174001", "kanjivaram-gold"),
    ]),
}));

const { productGridBlock } = await import("@/lib/content/blocks/product-grid");
const { getFeaturedProducts, getProductsByCollection, getProductsByIds } =
  await import("@/lib/data/products");

describe("Product-grid block", () => {
  it("exports correct type discriminant", () => {
    expect(productGridBlock.type).toBe("product-grid");
  });

  it("exports a Renderer function", () => {
    expect(typeof productGridBlock.Renderer).toBe("function");
  });

  it("exports editorMeta with no maxPerPage limit", () => {
    expect(productGridBlock.editorMeta.label).toBe("Product Grid");
    expect(productGridBlock.editorMeta.icon).toBe("grid-2x2");
    expect(productGridBlock.editorMeta.maxPerPage).toBeUndefined();
  });

  describe("propsSchema", () => {
    it("accepts minimal valid props with source=featured", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "featured",
      });
      expect(result.success).toBe(true);
    });

    it("accepts source=collection with collectionSlug", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "collection",
        collectionSlug: "banarasi",
      });
      expect(result.success).toBe(true);
    });

    it("accepts source=tag with tagName", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "tag",
        tagName: "silk",
      });
      expect(result.success).toBe(true);
    });

    it("accepts source=manual with valid UUID productIds", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "manual",
        productIds: [
          "123e4567-e89b-12d3-a456-426614174000",
          "123e4567-e89b-12d3-a456-426614174001",
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing source", () => {
      const result = productGridBlock.propsSchema.safeParse({
        heading: "Products",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid source enum", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "trending",
      });
      expect(result.success).toBe(false);
    });

    it("rejects limit below 1", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "featured",
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects limit above 12", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "featured",
        limit: 13,
      });
      expect(result.success).toBe(false);
    });

    it("rejects more than 12 productIds", () => {
      const uuids = Array.from(
        { length: 13 },
        (_, i) => `123e4567-e89b-12d3-a456-42661417${String(i).padStart(4, "0")}`
      );
      const result = productGridBlock.propsSchema.safeParse({
        source: "manual",
        productIds: uuids,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-UUID in productIds", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "manual",
        productIds: ["not-a-uuid"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid layout enum", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "featured",
        layout: "carousel",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid columns enum", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "featured",
        columns: "5",
      });
      expect(result.success).toBe(false);
    });

    it("applies correct defaults", () => {
      const result = productGridBlock.propsSchema.safeParse({
        source: "featured",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as { limit: number; layout: string; columns: string };
        expect(data.limit).toBe(4);
        expect(data.layout).toBe("grid");
        expect(data.columns).toBe("3");
      }
    });

    it("accepts all valid field combinations", () => {
      const result = productGridBlock.propsSchema.safeParse({
        eyebrow: "Our Collection",
        heading: "Featured Sarees",
        body: "Curated pieces for the season",
        ctaLabel: "View All",
        ctaHref: "/collection",
        source: "featured",
        limit: 6,
        layout: "bento",
        columns: "2",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Renderer — source routing", () => {
    it("calls getFeaturedProducts when source=featured", async () => {
      const validProps = productGridBlock.propsSchema.parse({
        source: "featured",
        limit: 4,
      });
      await productGridBlock.Renderer(validProps as Record<string, unknown>);
      expect(getFeaturedProducts).toHaveBeenCalledWith(4);
    });

    it("calls getProductsByCollection when source=collection", async () => {
      const validProps = productGridBlock.propsSchema.parse({
        source: "collection",
        collectionSlug: "banarasi",
        limit: 3,
      });
      await productGridBlock.Renderer(validProps as Record<string, unknown>);
      expect(getProductsByCollection).toHaveBeenCalledWith("banarasi", 3);
    });

    it("resolves UUIDs via getProductsByIds when source=manual (P3-02a)", async () => {
      const uuid1 = "123e4567-e89b-12d3-a456-426614174000";
      const uuid2 = "123e4567-e89b-12d3-a456-426614174001";
      const validProps = productGridBlock.propsSchema.parse({
        source: "manual",
        productIds: [uuid1, uuid2],
      });
      await productGridBlock.Renderer(validProps as Record<string, unknown>);
      expect(getProductsByIds).toHaveBeenCalledWith([uuid1, uuid2]);
    });
  });
});
