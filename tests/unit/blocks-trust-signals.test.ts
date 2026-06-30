/**
 * BLOCK-10: trust-signals block unit tests.
 *
 * Mutation-proof discipline (mirrors block-hero.test.ts / block-p308-new-blocks.test.ts):
 *   - Imports the REAL block module and the REAL registry (no block mocks).
 *   - propsSchema accepts valid objects and draft-safe partial rows while still
 *     rejecting wrong-typed fields and over-length content.
 *   - The Renderer output (via renderBlock → renderToStaticMarkup) contains the
 *     key content (stat values + labels).
 *
 * lucide-react renders pure SVGs server-side, so the Renderer needs no mocks.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// The registry imports product-grid → lib/data/products → db/index.ts, which
// throws without DATABASE_URL. Mock the data layer so the registry loads in Node
// (same approach as block-p308-new-blocks.test.ts / homepage-blocks.test.ts).
vi.mock("@/lib/data/products", () => ({
  getFeaturedProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductsByCollection: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductsByIds: vi.fn().mockResolvedValue([]),
  getProductBySlug: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/product/product-card", () => ({
  ProductCard: () => null,
}));
vi.mock("@/lib/media/resolve-media-url", () => ({
  resolveMediaURL: () => null,
}));
vi.mock("@/components/sections/newsletter", () => ({
  Newsletter: () => null,
}));
vi.mock("@/components/animations/scroll-reveal", () => ({
  ScrollReveal: ({ children }: { children: unknown }) => children,
}));

const { trustSignalsBlock, trustSignalsPropsSchema } = await import(
  "@/lib/content/blocks/trust-signals"
);
const { renderBlock, getBlock } = await import(
  "@/lib/content/blocks/registry"
);
const { BLOCK_EDITOR_SCHEMAS } = await import(
  "@/lib/content/blocks/block-editor-schemas"
);

const VALID_STATS = [
  { value: "200+", label: "Authenticated Sarees" },
  { value: "50+", label: "Happy Collectors" },
  { value: "100%", label: "Provenance Verified" },
];

describe("trust-signals block — registration & metadata", () => {
  it("exports correct type discriminant", () => {
    expect(trustSignalsBlock.type).toBe("trust-signals");
  });

  it("exports a Renderer function", () => {
    expect(typeof trustSignalsBlock.Renderer).toBe("function");
  });

  it("is registered in BLOCK_REGISTRY via getBlock", () => {
    const entry = getBlock("trust-signals");
    expect(entry).toBeDefined();
    expect(entry?.type).toBe("trust-signals");
  });

  it("exports editorMeta with label, lucide icon, and maxPerPage=1", () => {
    expect(trustSignalsBlock.editorMeta.label).toBe("Trust Signals");
    expect(trustSignalsBlock.editorMeta.icon).toBe("shield-check");
    expect(trustSignalsBlock.editorMeta.maxPerPage).toBe(1);
  });

  it("has a matching editor schema entry", () => {
    const schema = BLOCK_EDITOR_SCHEMAS["trust-signals"];
    expect(schema).toBeDefined();
    expect(schema.fields.stats).toBeDefined();
  });
});

describe("trust-signals block — propsSchema save-time validation", () => {
  it("accepts a valid 3-stat object", () => {
    const result = trustSignalsPropsSchema.safeParse({ stats: VALID_STATS });
    expect(result.success).toBe(true);
  });

  it("defaults omitted stats to an empty draft-safe list", () => {
    const result = trustSignalsPropsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stats).toEqual([]);
    }
  });

  // ── Draft-safe coercion cases ───────────────────────────────────────────────

  it("accepts a stat missing its value field as a draft row", () => {
    const result = trustSignalsPropsSchema.safeParse({
      stats: [
        { label: "Authenticated Sarees" },
        VALID_STATS[1],
        VALID_STATS[2],
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stats[0]).toMatchObject({
        value: "",
        label: "Authenticated Sarees",
      });
    }
  });

  it("accepts a stat missing its label field as a draft row", () => {
    const result = trustSignalsPropsSchema.safeParse({
      stats: [{ value: "200+" }, VALID_STATS[1], VALID_STATS[2]],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stats[0]).toMatchObject({
        value: "200+",
        label: "",
      });
    }
  });

  it("rejects a stat with a wrong-typed value (number instead of string)", () => {
    const result = trustSignalsPropsSchema.safeParse({
      stats: [{ value: 200, label: "Authenticated Sarees" }, VALID_STATS[1], VALID_STATS[2]],
    });
    expect(result.success).toBe(false);
  });

  it("accepts fewer than 3 stats for draft-safe editing", () => {
    const result = trustSignalsPropsSchema.safeParse({
      stats: [VALID_STATS[0], VALID_STATS[1]],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stats).toHaveLength(2);
    }
  });

  it("truncates more than 3 stats to the supported render limit", () => {
    const result = trustSignalsPropsSchema.safeParse({
      stats: [...VALID_STATS, { value: "1", label: "Extra" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stats).toEqual(VALID_STATS);
    }
  });

  it("rejects a value exceeding 40 chars", () => {
    const result = trustSignalsPropsSchema.safeParse({
      stats: [{ value: "x".repeat(41), label: "Label" }, VALID_STATS[1], VALID_STATS[2]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a label exceeding 80 chars", () => {
    const result = trustSignalsPropsSchema.safeParse({
      stats: [{ value: "200+", label: "x".repeat(81) }, VALID_STATS[1], VALID_STATS[2]],
    });
    expect(result.success).toBe(false);
  });
});

describe("trust-signals block — render-time validation (defense in depth)", () => {
  it("renderBlock throws when a stat field is wrong-typed", async () => {
    await expect(
      renderBlock({
        type: "trust-signals",
        props: { stats: [{ value: 1, label: "X" }, VALID_STATS[1], VALID_STATS[2]] },
      })
    ).rejects.toThrow();
  });

  it("renderBlock accepts non-tuple arity and renders complete draft rows", async () => {
    const node = await renderBlock({
      type: "trust-signals",
      props: { stats: [VALID_STATS[0]] },
    });
    const html = renderToStaticMarkup(node as ReactElement);

    expect(html).toContain("200+");
    expect(html).toContain("Authenticated Sarees");
  });
});

describe("trust-signals block — Renderer output contains key content", () => {
  it("renders nothing when no complete stats are supplied", async () => {
    const node = await renderBlock({ type: "trust-signals", props: {} });
    const html = renderToStaticMarkup(node as ReactElement);

    expect(html).toBe("");
  });

  it("renders custom stat content supplied via props", async () => {
    const node = await renderBlock({
      type: "trust-signals",
      props: {
        stats: [
          { value: "999", label: "Heritage Pieces" },
          { value: "42", label: "Master Weavers" },
          { value: "100%", label: "Hand Restored" },
        ],
      },
    });
    const html = renderToStaticMarkup(node as ReactElement);

    expect(html).toContain("999");
    expect(html).toContain("Heritage Pieces");
    expect(html).toContain("Master Weavers");
    expect(html).toContain("Hand Restored");
  });

  it("uses the same section markup/classes as the live section when visible stats exist", async () => {
    const node = await renderBlock({
      type: "trust-signals",
      props: { stats: VALID_STATS },
    });
    const html = renderToStaticMarkup(node as ReactElement);

    // Faithful reproduction of the hardcoded section's tokens/classes.
    expect(html).toContain("shadow-soft");
    expect(html).toContain("bg-primary/10");
    expect(html).toContain("tracking-[0.2em]");
  });
});
