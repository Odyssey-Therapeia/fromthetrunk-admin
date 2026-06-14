/**
 * P3-08: FAQ block rendered-output JSON-LD test.
 *
 * Follows the P1-16 pattern established in tests/unit/json-ld-render.test.ts:
 *  - Render the REAL component (renderBlock) via the registry.
 *  - Extract the emitted <script type="application/ld+json"> content.
 *  - Parse it with JSON.parse and assert schema.org shape + item count.
 *  - Assert </script> is escaped (DOM-injection guard).
 *  - Assert the data is mutation-proven (built from the items, not a static blob).
 *
 * Mocks:
 *  - @/lib/data/products — not used by faq block but imported transitively via
 *    registry (product-grid). Mock at the module level per discipline rules.
 *  - next/image, next/link — RSC deps not available in node env.
 *  - UI components used by block renderers.
 *
 * NO mocks on the faq block itself or on the safeJsonLd helper —
 * we test the REAL output of the REAL unit.
 */
import { describe, expect, it, vi } from "vitest";

// ── Transitive deps of the registry (product-grid, hero, etc.) ───────────────
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
// newsletter-signup block imports Newsletter (client component)
vi.mock("@/components/sections/newsletter", () => ({
  Newsletter: () => null,
}));
vi.mock("@/components/animations/scroll-reveal", () => ({
  ScrollReveal: ({ children }: { children: unknown }) => children,
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
const { renderBlock } = await import("@/lib/content/blocks/registry");
const { safeJsonLd } = await import("@/lib/seo/json-ld");

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render the FAQ block and extract the raw JSON string from the emitted
 * <script type="application/ld+json"> tag.
 *
 * renderBlock returns a ReactNode (JSX). In a Node/vitest environment the JSX
 * is a React element tree — we serialise it to a plain object and walk it to
 * find the script element carrying the JSON-LD payload.
 */
function extractJsonLdFromNode(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === "string" || typeof node === "number") return null;

  const el = node as {
    type?: unknown;
    props?: { type?: string; dangerouslySetInnerHTML?: { __html: string }; children?: unknown };
  };

  if (
    el.type === "script" &&
    el.props?.type === "application/ld+json" &&
    el.props?.dangerouslySetInnerHTML?.__html
  ) {
    return el.props.dangerouslySetInnerHTML.__html;
  }

  // Recurse into props.children
  if (el.props?.children !== undefined) {
    const children = el.props.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const found = extractJsonLdFromNode(child);
        if (found !== null) return found;
      }
    } else {
      return extractJsonLdFromNode(children);
    }
  }

  return null;
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    question: "What is From the Trunk?",
    answer: "From the Trunk is a curated marketplace for pre-loved sarees.",
  },
  {
    question: "How do I return an item?",
    answer: "Returns are accepted within 7 days of delivery.",
  },
];

const FAQ_ITEMS_WITH_INJECTION = [
  {
    question: 'Can I use <b>bold</b> in a question?',
    answer: "Yes, but </script><script>alert(1)</script> should be escaped.",
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FAQ block — FAQPage JSON-LD rendered-output tests (P1-16 pattern)", () => {
  it("renderBlock succeeds for valid faq props", async () => {
    const node = await renderBlock({
      type: "faq",
      props: {
        heading: "Frequently Asked Questions",
        items: FAQ_ITEMS,
      },
    });
    expect(node).toBeDefined();
  });

  it("emits a script[type=application/ld+json] element", async () => {
    const node = await renderBlock({
      type: "faq",
      props: {
        heading: "FAQ",
        items: FAQ_ITEMS,
      },
    });

    const raw = extractJsonLdFromNode(node);
    expect(raw).not.toBeNull();
  });

  it("Test A — FAQPage @type and mainEntity length reflect real items (mutation-proven)", async () => {
    const node = await renderBlock({
      type: "faq",
      props: {
        heading: "FAQ",
        items: FAQ_ITEMS,
      },
    });

    const raw = extractJsonLdFromNode(node);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@type"]).toBe("FAQPage");
    // mutation-proof: length must match FAQ_ITEMS length, not a hardcoded 2
    expect(parsed.mainEntity).toHaveLength(FAQ_ITEMS.length);
  });

  it("Test B — mainEntity items have correct schema.org Question/Answer shape", async () => {
    const node = await renderBlock({
      type: "faq",
      props: {
        items: FAQ_ITEMS,
      },
    });

    const raw = extractJsonLdFromNode(node);
    const parsed = JSON.parse(raw!);

    const first = parsed.mainEntity[0];
    expect(first["@type"]).toBe("Question");
    expect(first.name).toBe(FAQ_ITEMS[0].question);
    expect(first.acceptedAnswer["@type"]).toBe("Answer");
    expect(first.acceptedAnswer.text).toBe(FAQ_ITEMS[0].answer);
  });

  it("Test C — question and answer values round-trip from JSON.parse (mutation-proven)", async () => {
    // Use a single-item FAQ to prove values are driven by data, not static blob
    const singleItem = [{ question: "Unique Q xyz", answer: "Unique A xyz" }];
    const node = await renderBlock({
      type: "faq",
      props: { items: singleItem },
    });

    const raw = extractJsonLdFromNode(node);
    const parsed = JSON.parse(raw!);
    expect(parsed.mainEntity[0].name).toBe("Unique Q xyz");
    expect(parsed.mainEntity[0].acceptedAnswer.text).toBe("Unique A xyz");
  });

  it("Test D — </script> in answer is escaped (DOM-injection guard)", async () => {
    const node = await renderBlock({
      type: "faq",
      props: { items: FAQ_ITEMS_WITH_INJECTION },
    });

    const raw = extractJsonLdFromNode(node);
    expect(raw).not.toBeNull();

    // The raw HTML string inserted into the DOM must NOT contain </script>
    expect(raw).not.toContain("</script>");
    // It must contain the unicode escape that safeJsonLd produces
    expect(raw).toContain("\\u003c");

    // But JSON.parse must still decode it correctly (round-trip)
    const parsed = JSON.parse(raw!);
    expect(parsed.mainEntity[0].acceptedAnswer.text).toContain("</script>");
  });

  it("Test E — safeJsonLd used: raw HTML has no unescaped < from injection attempt", async () => {
    // Verify the < in the question is also escaped
    const node = await renderBlock({
      type: "faq",
      props: { items: FAQ_ITEMS_WITH_INJECTION },
    });
    const raw = extractJsonLdFromNode(node);
    // raw must not have literal < anywhere (safeJsonLd replaces all < with <)
    expect(raw).not.toMatch(/<[^\\]/);
  });

  it("faq propsSchema rejects missing items", async () => {
    // Standalone schema validation (save-time defense) — uses the real module
    const { faqPropsSchema } = await import("@/lib/content/blocks/faq");
    const result = faqPropsSchema.safeParse({ heading: "FAQ" });
    expect(result.success).toBe(false);
  });

  it("faq propsSchema rejects items array exceeding 20", async () => {
    const { faqPropsSchema } = await import("@/lib/content/blocks/faq");
    const items = Array.from({ length: 21 }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`,
    }));
    const result = faqPropsSchema.safeParse({ items });
    expect(result.success).toBe(false);
  });

  it("faq propsSchema rejects question exceeding 300 chars", async () => {
    const { faqPropsSchema } = await import("@/lib/content/blocks/faq");
    const result = faqPropsSchema.safeParse({
      items: [{ question: "x".repeat(301), answer: "A" }],
    });
    expect(result.success).toBe(false);
  });

  it("faq propsSchema rejects answer exceeding 2000 chars", async () => {
    const { faqPropsSchema } = await import("@/lib/content/blocks/faq");
    const result = faqPropsSchema.safeParse({
      items: [{ question: "Q", answer: "x".repeat(2001) }],
    });
    expect(result.success).toBe(false);
  });
});
