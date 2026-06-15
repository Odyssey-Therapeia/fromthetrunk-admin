/**
 * BLOCK-11: how-it-works block unit tests.
 *
 * Mutation-proof discipline (mirrors block-p308-new-blocks.test.ts):
 *   - Imports the REAL block module and the REAL registry (no block mocks).
 *   - propsSchema accepts a valid object and REJECTS invalid ones (missing /
 *     wrong-typed field, over-length, wrong arity).
 *   - The Renderer output (via renderBlock → renderToStaticMarkup) contains the
 *     key content (eyebrow, heading, step titles + descriptions).
 *
 * Transitive dep mocks (I/O / client-only — same approach as homepage-blocks.test.ts):
 *   - gsap + ScrollReveal: ScrollReveal is a "use client" component that calls
 *     gsap.registerPlugin() at module load. Mock both so it renders in Node.
 *   - next/link + Button: imported by components/ui/bento-grid (BentoCard path).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("gsap", () => ({
  default: { registerPlugin: () => {}, context: () => ({ revert: () => {} }) },
  gsap: { registerPlugin: () => {}, context: () => ({ revert: () => {} }) },
}));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {} }));
vi.mock("@/components/animations/scroll-reveal", () => ({
  ScrollReveal: ({ children }: { children: unknown }) => children,
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: unknown }) => children,
}));

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
vi.mock("@/components/product/product-card", () => ({
  ProductCard: () => null,
}));
vi.mock("@/lib/media/resolve-media-url", () => ({
  resolveMediaURL: () => null,
}));
vi.mock("@/components/sections/newsletter", () => ({
  Newsletter: () => null,
}));

const { howItWorksBlock, howItWorksPropsSchema } = await import(
  "@/lib/content/blocks/how-it-works"
);
const { renderBlock, getBlock } = await import(
  "@/lib/content/blocks/registry"
);
const { BLOCK_EDITOR_SCHEMAS } = await import(
  "@/lib/content/blocks/block-editor-schemas"
);

const VALID_STEPS = [
  {
    title: "Curate",
    description:
      "We source sarees from private wardrobes, couture archives, and heritage collectors.",
  },
  {
    title: "Authenticate",
    description:
      "Each piece is inspected, restored, and documented with provenance.",
  },
  {
    title: "Deliver",
    description:
      "Your saree arrives with a story card, preservation notes, and careful packaging.",
  },
];

describe("how-it-works block — registration & metadata", () => {
  it("exports correct type discriminant", () => {
    expect(howItWorksBlock.type).toBe("how-it-works");
  });

  it("exports a Renderer function", () => {
    expect(typeof howItWorksBlock.Renderer).toBe("function");
  });

  it("is registered in BLOCK_REGISTRY via getBlock", () => {
    const entry = getBlock("how-it-works");
    expect(entry).toBeDefined();
    expect(entry?.type).toBe("how-it-works");
  });

  it("exports editorMeta with label, lucide icon, and maxPerPage=1", () => {
    expect(howItWorksBlock.editorMeta.label).toBe("How It Works");
    expect(howItWorksBlock.editorMeta.icon).toBe("list-ordered");
    expect(howItWorksBlock.editorMeta.maxPerPage).toBe(1);
  });

  it("has a matching editor schema entry", () => {
    const schema = BLOCK_EDITOR_SCHEMAS["how-it-works"];
    expect(schema).toBeDefined();
    expect(schema.fields.steps).toBeDefined();
    expect(schema.fields.heading).toBeDefined();
    expect(schema.fields.eyebrow).toBeDefined();
  });
});

describe("how-it-works block — propsSchema save-time validation", () => {
  it("accepts a valid full object", () => {
    const result = howItWorksPropsSchema.safeParse({
      eyebrow: "How It Works",
      heading: "From trunk to your wardrobe",
      steps: VALID_STEPS,
    });
    expect(result.success).toBe(true);
  });

  it("applies the current homepage defaults when fields omitted", () => {
    const result = howItWorksPropsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eyebrow).toBe("How It Works");
      expect(result.data.heading).toBe("From trunk to your wardrobe");
      expect(result.data.steps).toEqual(VALID_STEPS);
    }
  });

  // ── REJECTION cases (mutation proof) ───────────────────────────────────────

  it("rejects a step missing its title field", () => {
    const result = howItWorksPropsSchema.safeParse({
      steps: [{ description: "No title here." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a step missing its description field", () => {
    const result = howItWorksPropsSchema.safeParse({
      steps: [{ title: "Curate" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a step with a wrong-typed title (number instead of string)", () => {
    const result = howItWorksPropsSchema.safeParse({
      steps: [{ title: 1, description: "Desc" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty steps array (min 1)", () => {
    const result = howItWorksPropsSchema.safeParse({ steps: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 6 steps (max 6)", () => {
    const steps = Array.from({ length: 7 }, (_, i) => ({
      title: `Step ${i}`,
      description: "Desc",
    }));
    const result = howItWorksPropsSchema.safeParse({ steps });
    expect(result.success).toBe(false);
  });

  it("rejects a title exceeding 80 chars", () => {
    const result = howItWorksPropsSchema.safeParse({
      steps: [{ title: "x".repeat(81), description: "Desc" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a description exceeding 400 chars", () => {
    const result = howItWorksPropsSchema.safeParse({
      steps: [{ title: "Curate", description: "x".repeat(401) }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a heading exceeding 200 chars", () => {
    const result = howItWorksPropsSchema.safeParse({
      heading: "x".repeat(201),
      steps: VALID_STEPS,
    });
    expect(result.success).toBe(false);
  });
});

describe("how-it-works block — render-time validation (defense in depth)", () => {
  it("renderBlock throws when steps is empty", async () => {
    await expect(
      renderBlock({ type: "how-it-works", props: { steps: [] } })
    ).rejects.toThrow();
  });

  it("renderBlock throws when a step is wrong-typed", async () => {
    await expect(
      renderBlock({
        type: "how-it-works",
        props: { steps: [{ title: 1, description: "Desc" }] },
      })
    ).rejects.toThrow();
  });
});

describe("how-it-works block — Renderer output contains key content", () => {
  it("renders the default eyebrow, heading, and step content", async () => {
    const node = await renderBlock({ type: "how-it-works", props: {} });
    const html = renderToStaticMarkup(node as ReactElement);

    expect(html).toContain("How It Works");
    expect(html).toContain("From trunk to your wardrobe");
    expect(html).toContain("Curate");
    expect(html).toContain("Authenticate");
    expect(html).toContain("Deliver");
    expect(html).toContain("documented with provenance");
    // numbered steps
    expect(html).toContain("01");
    expect(html).toContain("02");
    expect(html).toContain("03");
  });

  it("renders custom eyebrow/heading/steps supplied via props", async () => {
    const node = await renderBlock({
      type: "how-it-works",
      props: {
        eyebrow: "Our Process",
        heading: "Three simple steps",
        steps: [
          { title: "Discover", description: "Find your perfect drape." },
          { title: "Reserve", description: "Hold it with one tap." },
        ],
      },
    });
    const html = renderToStaticMarkup(node as ReactElement);

    expect(html).toContain("Our Process");
    expect(html).toContain("Three simple steps");
    expect(html).toContain("Discover");
    expect(html).toContain("Find your perfect drape.");
    expect(html).toContain("Reserve");
  });

  it("uses the same section markup/classes as the live section", async () => {
    const node = await renderBlock({ type: "how-it-works", props: {} });
    const html = renderToStaticMarkup(node as ReactElement);

    // Faithful reproduction of the hardcoded section's tokens/classes.
    expect(html).toContain("shadow-soft");
    expect(html).toContain("tracking-[0.4em]");
    expect(html).toContain("font-serif");
  });
});
