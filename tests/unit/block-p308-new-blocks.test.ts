/**
 * P3-08: Mutation-proof propsSchema validation tests for the 5 new blocks
 * that were not covered by the FAQ test file:
 *   - image-text-split (BLOCK-03)
 *   - story-editorial (BLOCK-05)
 *   - newsletter-signup (BLOCK-07)
 *   - announcement-bar (BLOCK-08)
 *   - spacer (BLOCK-09)
 *
 * Test discipline:
 *   - Tests import the REAL block module (not mocked).
 *   - propsSchema save-time tests call safeParse directly on the real schema.
 *   - renderBlock render-time tests call renderBlock() via the real registry
 *     and assert BlockPropsValidationError is thrown for invalid props.
 *   - No mocks on the blocks themselves — lowest-level deps only.
 *
 * Also covers block-registry for all 9 registered block types (getBlock,
 * renderBlock invalid props, editorMeta).
 */

import { describe, expect, it, vi } from "vitest";

// ── Transitive deps of the registry ──────────────────────────────────────────
// product-grid imports lib/data/products which requires DATABASE_URL
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
// newsletter-signup block wraps the Newsletter client component
vi.mock("@/components/sections/newsletter", () => ({
  Newsletter: () => null,
}));
vi.mock("@/components/animations/scroll-reveal", () => ({
  ScrollReveal: ({ children }: { children: unknown }) => children,
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
const { renderBlock, getBlock, BLOCK_REGISTRY } = await import(
  "@/lib/content/blocks/registry"
);
const { imageTextSplitPropsSchema, imageTextSplitBlock } = await import(
  "@/lib/content/blocks/image-text-split"
);
const { storyEditorialPropsSchema, storyEditorialBlock } = await import(
  "@/lib/content/blocks/story-editorial"
);
const { newsletterSignupPropsSchema, newsletterSignupBlock } = await import(
  "@/lib/content/blocks/newsletter-signup"
);
const { announcementBarPropsSchema, announcementBarBlock } = await import(
  "@/lib/content/blocks/announcement-bar"
);
const { spacerPropsSchema, spacerBlock } = await import(
  "@/lib/content/blocks/spacer"
);
const { BLOCK_EDITOR_SCHEMAS } = await import(
  "@/lib/content/blocks/block-editor-schemas"
);

// ── Helper fixture UUIDs ──────────────────────────────────────────────────────
const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

// ═══════════════════════════════════════════════════════════════════════════════
// Registry: all 9 types registered
// ═══════════════════════════════════════════════════════════════════════════════

describe("Block registry — all 11 block types registered", () => {
  const ALL_TYPES = [
    "hero",
    "rich-text",
    "product-grid",
    "image-text-split",
    "story-editorial",
    "faq",
    "newsletter-signup",
    "announcement-bar",
    "spacer",
    "trust-signals",
    "how-it-works",
  ];

  it("BLOCK_REGISTRY has exactly 11 entries", () => {
    expect(BLOCK_REGISTRY.size).toBe(11);
  });

  for (const type of ALL_TYPES) {
    it(`getBlock("${type}") returns a registered entry`, () => {
      const entry = getBlock(type);
      expect(entry).toBeDefined();
      expect(entry?.type).toBe(type);
      expect(typeof entry?.Renderer).toBe("function");
      expect(entry?.propsSchema).toBeDefined();
      expect(entry?.editorMeta).toBeDefined();
    });
  }

  it("unknown type still returns undefined", () => {
    expect(getBlock("does-not-exist")).toBeUndefined();
  });

  it("renderBlock still throws UnknownBlockTypeError for unregistered type", async () => {
    await expect(
      renderBlock({ type: "does-not-exist", props: {} })
    ).rejects.toThrow(/unknown block type/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// editorMeta shape for new blocks
// ═══════════════════════════════════════════════════════════════════════════════

describe("Block registry — editorMeta for P3-08 blocks", () => {
  it("image-text-split editorMeta: label, icon, no maxPerPage", () => {
    const entry = getBlock("image-text-split");
    expect(entry!.editorMeta.label).toBe("Image + Text");
    expect(entry!.editorMeta.icon).toBe("layout-panel-left");
    expect(entry!.editorMeta.maxPerPage).toBeUndefined();
  });

  it("story-editorial editorMeta: label, icon, maxPerPage=1", () => {
    const entry = getBlock("story-editorial");
    expect(entry!.editorMeta.label).toBe("Story / Editorial");
    expect(entry!.editorMeta.icon).toBe("book-open");
    expect(entry!.editorMeta.maxPerPage).toBe(1);
  });

  it("faq editorMeta: icon=message-circle-question, no maxPerPage", () => {
    const entry = getBlock("faq");
    expect(entry!.editorMeta.icon).toBe("message-circle-question");
    expect(entry!.editorMeta.maxPerPage).toBeUndefined();
  });

  it("newsletter-signup editorMeta: label, icon, maxPerPage=1", () => {
    const entry = getBlock("newsletter-signup");
    expect(entry!.editorMeta.label).toBe("Newsletter Signup");
    expect(entry!.editorMeta.icon).toBe("mail");
    expect(entry!.editorMeta.maxPerPage).toBe(1);
  });

  it("announcement-bar editorMeta: label, icon, maxPerPage=1", () => {
    const entry = getBlock("announcement-bar");
    expect(entry!.editorMeta.label).toBe("Announcement Bar");
    expect(entry!.editorMeta.icon).toBe("megaphone");
    expect(entry!.editorMeta.maxPerPage).toBe(1);
  });

  it("spacer editorMeta: label, icon, no maxPerPage", () => {
    const entry = getBlock("spacer");
    expect(entry!.editorMeta.label).toBe("Spacer / Divider");
    expect(entry!.editorMeta.icon).toBe("separator-horizontal");
    expect(entry!.editorMeta.maxPerPage).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK-03: image-text-split
// ═══════════════════════════════════════════════════════════════════════════════

describe("image-text-split block", () => {
  it("exports correct type discriminant", () => {
    expect(imageTextSplitBlock.type).toBe("image-text-split");
  });

  it("exports a Renderer function", () => {
    expect(typeof imageTextSplitBlock.Renderer).toBe("function");
  });

  describe("propsSchema — save-time validation", () => {
    it("accepts minimal valid props (heading + body + image UUID)", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Our Story",
        body: "Some body text",
        image: VALID_UUID,
      });
      expect(result.success).toBe(true);
    });

    it("accepts full valid props", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        eyebrow: "About Us",
        heading: "Our Story Begins",
        body: "<p>Rich text with <strong>markup</strong></p>",
        image: VALID_UUID,
        imageAlt: "A beautiful saree",
        imagePosition: "left",
        ctaLabel: "Learn More",
        ctaHref: "/our-story",
        background: "muted",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing heading", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        body: "Some body",
        image: VALID_UUID,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing body", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Some heading",
        image: VALID_UUID,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing image", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Some heading",
        body: "Some body",
      });
      expect(result.success).toBe(false);
    });

    it("rejects image that is not a valid UUID", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Some heading",
        body: "Some body",
        image: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects heading exceeding 200 chars", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "x".repeat(201),
        body: "Some body",
        image: VALID_UUID,
      });
      expect(result.success).toBe(false);
    });

    it("rejects body exceeding 2000 chars", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Heading",
        body: "x".repeat(2001),
        image: VALID_UUID,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid imagePosition enum", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Heading",
        body: "Body",
        image: VALID_UUID,
        imagePosition: "center",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid background enum", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Heading",
        body: "Body",
        image: VALID_UUID,
        background: "dark",
      });
      expect(result.success).toBe(false);
    });

    it("applies default imagePosition=right", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Heading",
        body: "Body",
        image: VALID_UUID,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { imagePosition: string }).imagePosition).toBe("right");
      }
    });

    it("applies default background=transparent", () => {
      const result = imageTextSplitPropsSchema.safeParse({
        heading: "Heading",
        body: "Body",
        image: VALID_UUID,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { background: string }).background).toBe("transparent");
      }
    });
  });

  describe("renderBlock — render-time validation (defense in depth)", () => {
    it("renderBlock succeeds for valid image-text-split props", async () => {
      const node = await renderBlock({
        type: "image-text-split",
        props: {
          heading: "Our Story",
          body: "Some body text",
          image: VALID_UUID,
        },
      });
      expect(node).toBeDefined();
    });

    it("renderBlock throws BlockPropsValidationError when heading is missing", async () => {
      await expect(
        renderBlock({
          type: "image-text-split",
          props: {
            body: "Body only",
            image: VALID_UUID,
          },
        })
      ).rejects.toThrow();
    });

    it("renderBlock throws when image is not a UUID", async () => {
      await expect(
        renderBlock({
          type: "image-text-split",
          props: {
            heading: "Heading",
            body: "Body",
            image: "not-a-uuid",
          },
        })
      ).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK-05: story-editorial
// ═══════════════════════════════════════════════════════════════════════════════

describe("story-editorial block", () => {
  it("exports correct type discriminant", () => {
    expect(storyEditorialBlock.type).toBe("story-editorial");
  });

  it("exports a Renderer function", () => {
    expect(typeof storyEditorialBlock.Renderer).toBe("function");
  });

  describe("propsSchema — save-time validation", () => {
    const VALID_BEAT = {
      paragraphs: ["A paragraph of narrative."],
      layout: "image-right" as const,
    };

    it("accepts minimal valid props (one beat)", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [VALID_BEAT],
      });
      expect(result.success).toBe(true);
    });

    it("accepts full valid props with image and climax lines", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [
          {
            paragraphs: ["First paragraph.", "Second paragraph."],
            image: VALID_UUID,
            imageAlt: "A saree detail",
            layout: "image-left",
          },
          {
            paragraphs: ["The climax approaches."],
            layout: "text-only-dark",
          },
        ],
        climaxLines: ["Every saree holds a story.", "Cherish yours."],
        ctaLabel: "Explore the Collection",
        ctaHref: "/collection",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty beats array", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects beats array exceeding 6 items", () => {
      const beats = Array.from({ length: 7 }, () => VALID_BEAT);
      const result = storyEditorialPropsSchema.safeParse({ beats });
      expect(result.success).toBe(false);
    });

    it("rejects beat with empty paragraphs array", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [{ paragraphs: [], layout: "image-right" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects beat with more than 4 paragraphs", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [
          {
            paragraphs: ["p1", "p2", "p3", "p4", "p5"],
            layout: "image-right",
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects paragraph exceeding 600 chars", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [
          {
            paragraphs: ["x".repeat(601)],
            layout: "image-right",
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid layout enum in a beat", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [{ paragraphs: ["A para."], layout: "side-by-side" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects beat image that is not a UUID", () => {
      const result = storyEditorialPropsSchema.safeParse({
        beats: [{ paragraphs: ["Para."], layout: "image-right", image: "not-a-uuid" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects more than 6 climax lines", () => {
      const lines = Array.from({ length: 7 }, (_, i) => `Line ${i}`);
      const result = storyEditorialPropsSchema.safeParse({
        beats: [VALID_BEAT],
        climaxLines: lines,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing beats entirely", () => {
      const result = storyEditorialPropsSchema.safeParse({
        ctaLabel: "CTA Only",
        ctaHref: "/page",
      });
      expect(result.success).toBe(false);
    });

    it("accepts all valid layout enum values", () => {
      for (const layout of ["image-right", "image-left", "text-only-dark", "full-bleed"] as const) {
        const result = storyEditorialPropsSchema.safeParse({
          beats: [{ paragraphs: ["A paragraph."], layout }],
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("renderBlock — render-time validation (defense in depth)", () => {
    it("renderBlock succeeds for valid story-editorial props", async () => {
      const node = await renderBlock({
        type: "story-editorial",
        props: {
          beats: [
            { paragraphs: ["A paragraph."], layout: "image-right" },
          ],
        },
      });
      expect(node).toBeDefined();
    });

    it("renderBlock throws when beats is missing", async () => {
      await expect(
        renderBlock({
          type: "story-editorial",
          props: {
            ctaLabel: "No beats",
          },
        })
      ).rejects.toThrow();
    });

    it("renderBlock throws when beats is empty", async () => {
      await expect(
        renderBlock({
          type: "story-editorial",
          props: { beats: [] },
        })
      ).rejects.toThrow();
    });

    it("renderBlock throws when beat has invalid layout", async () => {
      await expect(
        renderBlock({
          type: "story-editorial",
          props: {
            beats: [{ paragraphs: ["Para."], layout: "invalid-layout" }],
          },
        })
      ).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK-07: newsletter-signup
// ═══════════════════════════════════════════════════════════════════════════════

describe("newsletter-signup block", () => {
  it("exports correct type discriminant", () => {
    expect(newsletterSignupBlock.type).toBe("newsletter-signup");
  });

  it("exports a Renderer function", () => {
    expect(typeof newsletterSignupBlock.Renderer).toBe("function");
  });

  describe("propsSchema — save-time validation", () => {
    it("accepts minimal valid props (heading only required)", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "Stay in the loop",
      });
      expect(result.success).toBe(true);
    });

    it("accepts full valid props", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        eyebrow: "Private Drops",
        heading: "Be the first to know",
        body: "Curated drops delivered once a fortnight.",
        inputPlaceholder: "Your email address",
        buttonLabel: "Subscribe",
        background: "secondary",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing heading", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        eyebrow: "Newsletter",
        body: "Some body",
      });
      expect(result.success).toBe(false);
    });

    it("rejects heading exceeding 200 chars", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "x".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it("rejects eyebrow exceeding 80 chars", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "Valid heading",
        eyebrow: "x".repeat(81),
      });
      expect(result.success).toBe(false);
    });

    it("rejects body exceeding 400 chars", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "Valid heading",
        body: "x".repeat(401),
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid background enum", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "Valid heading",
        background: "dark",
      });
      expect(result.success).toBe(false);
    });

    it("applies default inputPlaceholder", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "Valid heading",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { inputPlaceholder: string }).inputPlaceholder).toBe(
          "Enter your email"
        );
      }
    });

    it("applies default buttonLabel", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "Valid heading",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { buttonLabel: string }).buttonLabel).toBe("Join the list");
      }
    });

    it("applies default background=card", () => {
      const result = newsletterSignupPropsSchema.safeParse({
        heading: "Valid heading",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { background: string }).background).toBe("card");
      }
    });

    it("accepts all valid background enum values", () => {
      for (const background of ["card", "secondary", "transparent"] as const) {
        const result = newsletterSignupPropsSchema.safeParse({
          heading: "Valid heading",
          background,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("renderBlock — render-time validation (defense in depth)", () => {
    it("renderBlock succeeds for valid newsletter-signup props", async () => {
      const node = await renderBlock({
        type: "newsletter-signup",
        props: {
          heading: "Stay in the loop",
        },
      });
      expect(node).toBeDefined();
    });

    it("renderBlock throws BlockPropsValidationError when heading is missing", async () => {
      await expect(
        renderBlock({
          type: "newsletter-signup",
          props: {
            eyebrow: "Newsletter",
          },
        })
      ).rejects.toThrow();
    });

    it("renderBlock throws when background is an invalid enum value", async () => {
      await expect(
        renderBlock({
          type: "newsletter-signup",
          props: {
            heading: "Valid heading",
            background: "not-valid",
          },
        })
      ).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK-08: announcement-bar
// ═══════════════════════════════════════════════════════════════════════════════

describe("announcement-bar block", () => {
  it("exports correct type discriminant", () => {
    expect(announcementBarBlock.type).toBe("announcement-bar");
  });

  it("exports a Renderer function", () => {
    expect(typeof announcementBarBlock.Renderer).toBe("function");
  });

  describe("propsSchema — save-time validation", () => {
    it("accepts minimal valid props (one message)", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: ["Grand Launch Week"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts full valid props with CTA and accent background", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: [
          "Grand Launch Week",
          "Complimentary styling consult",
          "Free shipping on orders above ₹5000",
        ],
        ctaLabel: "Explore the Collection",
        ctaHref: "/collection",
        background: "accent",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty messages array", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects messages array exceeding 5 items", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: ["M1", "M2", "M3", "M4", "M5", "M6"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a message exceeding 200 chars", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: ["x".repeat(201)],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing messages field", () => {
      const result = announcementBarPropsSchema.safeParse({
        ctaLabel: "Shop Now",
        ctaHref: "/shop",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid background enum", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: ["Hello"],
        background: "muted",
      });
      expect(result.success).toBe(false);
    });

    it("applies default background=primary", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: ["Hello world"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { background: string }).background).toBe("primary");
      }
    });

    it("accepts all valid background enum values", () => {
      for (const background of ["primary", "accent", "foreground"] as const) {
        const result = announcementBarPropsSchema.safeParse({
          messages: ["Test message"],
          background,
        });
        expect(result.success).toBe(true);
      }
    });

    it("accepts exactly 5 messages (boundary)", () => {
      const result = announcementBarPropsSchema.safeParse({
        messages: ["M1", "M2", "M3", "M4", "M5"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("renderBlock — render-time validation (defense in depth)", () => {
    it("renderBlock succeeds for valid announcement-bar props", async () => {
      const node = await renderBlock({
        type: "announcement-bar",
        props: {
          messages: ["Grand Launch Week"],
        },
      });
      expect(node).toBeDefined();
    });

    it("renderBlock throws when messages is missing", async () => {
      await expect(
        renderBlock({
          type: "announcement-bar",
          props: {
            ctaLabel: "Shop Now",
          },
        })
      ).rejects.toThrow();
    });

    it("renderBlock throws when messages array is empty", async () => {
      await expect(
        renderBlock({
          type: "announcement-bar",
          props: { messages: [] },
        })
      ).rejects.toThrow();
    });

    it("renderBlock throws when background is an invalid enum value", async () => {
      await expect(
        renderBlock({
          type: "announcement-bar",
          props: {
            messages: ["Hello"],
            background: "not-valid",
          },
        })
      ).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK-09: spacer
// ═══════════════════════════════════════════════════════════════════════════════

describe("spacer block", () => {
  it("exports correct type discriminant", () => {
    expect(spacerBlock.type).toBe("spacer");
  });

  it("exports a Renderer function", () => {
    expect(typeof spacerBlock.Renderer).toBe("function");
  });

  describe("propsSchema — save-time validation", () => {
    it("accepts empty props (all have defaults)", () => {
      const result = spacerPropsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts explicit size and showDivider", () => {
      const result = spacerPropsSchema.safeParse({
        size: "xl",
        showDivider: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid size enum", () => {
      const result = spacerPropsSchema.safeParse({
        size: "xxl",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-boolean showDivider", () => {
      const result = spacerPropsSchema.safeParse({
        showDivider: "yes",
      });
      expect(result.success).toBe(false);
    });

    it("applies default size=md", () => {
      const result = spacerPropsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { size: string }).size).toBe("md");
      }
    });

    it("applies default showDivider=false", () => {
      const result = spacerPropsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { showDivider: boolean }).showDivider).toBe(false);
      }
    });

    it("accepts all valid size enum values", () => {
      for (const size of ["sm", "md", "lg", "xl"] as const) {
        const result = spacerPropsSchema.safeParse({ size });
        expect(result.success).toBe(true);
      }
    });

    it("rejects size=xs (not in enum)", () => {
      const result = spacerPropsSchema.safeParse({ size: "xs" });
      expect(result.success).toBe(false);
    });
  });

  describe("renderBlock — render-time validation (defense in depth)", () => {
    it("renderBlock succeeds for valid spacer props (empty)", async () => {
      const node = await renderBlock({
        type: "spacer",
        props: {},
      });
      expect(node).toBeDefined();
    });

    it("renderBlock succeeds with explicit size=xl and showDivider=true", async () => {
      const node = await renderBlock({
        type: "spacer",
        props: { size: "xl", showDivider: true },
      });
      expect(node).toBeDefined();
    });

    it("renderBlock throws when size is an invalid enum value", async () => {
      await expect(
        renderBlock({
          type: "spacer",
          props: { size: "xxl" },
        })
      ).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK_EDITOR_SCHEMAS — all 9 types have entries
// ═══════════════════════════════════════════════════════════════════════════════

describe("BLOCK_EDITOR_SCHEMAS — all 11 block types have editor schemas", () => {
  const EXPECTED_TYPES = [
    "hero",
    "rich-text",
    "product-grid",
    "image-text-split",
    "story-editorial",
    "faq",
    "newsletter-signup",
    "announcement-bar",
    "spacer",
    "trust-signals",
    "how-it-works",
  ];

  it("BLOCK_EDITOR_SCHEMAS has exactly 11 entries", () => {
    expect(Object.keys(BLOCK_EDITOR_SCHEMAS)).toHaveLength(11);
  });

  for (const type of EXPECTED_TYPES) {
    it(`BLOCK_EDITOR_SCHEMAS["${type}"] has a fields object`, () => {
      const schema = BLOCK_EDITOR_SCHEMAS[type];
      expect(schema).toBeDefined();
      expect(schema.fields).toBeDefined();
      expect(typeof schema.fields).toBe("object");
      expect(Object.keys(schema.fields).length).toBeGreaterThan(0);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Composer round-trip tests (FT-12 list-of-text wiring)
//
// These prove that when the SchemaForm engine drives list-of-text fields,
// the emitted string[] value passes the REAL block propsSchemas — so the
// editor cannot produce data that fails renderBlock at runtime.
//
// The key gap previously: list-of-group with a {value} subfield emitted
// [{value: "..."}] but the propsSchemas expected string[]. FT-12 (list-of-text)
// fixes this by emitting string[] directly.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Composer round-trip — FT-12 list-of-text produces propsSchema-valid data", () => {
  // Simulate the value that ListOfTextField emits: a plain string[].
  // This is the data shape that reaches the block's propsSchema on save.

  describe("announcement-bar: messages (list-of-text → string[])", () => {
    it("list-of-text output (string[]) passes announcementBarPropsSchema.safeParse", () => {
      // Simulate editor adding 2 message rows
      const editorOutput = {
        messages: ["Grand Launch Week", "Complimentary styling consult"],
      };
      const result = announcementBarPropsSchema.safeParse(editorOutput);
      expect(result.success).toBe(true);
    });

    it("list-of-text empty (no rows) fails announcementBarPropsSchema (min 1)", () => {
      const editorOutput = { messages: [] };
      const result = announcementBarPropsSchema.safeParse(editorOutput);
      expect(result.success).toBe(false);
    });

    it("renderBlock does NOT throw when fed list-of-text output shape", async () => {
      const props = {
        messages: ["Grand Launch Week", "Complimentary styling consult"],
        background: "primary",
      };
      const node = await renderBlock({ type: "announcement-bar", props });
      expect(node).toBeDefined();
    });

    it("editor schema field type for messages is list-of-text (FT-12)", () => {
      const schema = BLOCK_EDITOR_SCHEMAS["announcement-bar"];
      expect(schema.fields.messages.meta.type).toBe("list-of-text");
    });
  });

  describe("story-editorial: climaxLines (list-of-text → string[])", () => {
    const VALID_BEAT = {
      paragraphs: ["A paragraph of narrative."],
      layout: "image-right" as const,
    };

    it("list-of-text output for climaxLines (string[]) passes storyEditorialPropsSchema.safeParse", () => {
      const editorOutput = {
        beats: [VALID_BEAT],
        climaxLines: ["Every saree holds a story.", "Cherish yours."],
      };
      const result = storyEditorialPropsSchema.safeParse(editorOutput);
      expect(result.success).toBe(true);
    });

    it("renderBlock does NOT throw with list-of-text climaxLines", async () => {
      const props = {
        beats: [VALID_BEAT],
        climaxLines: ["Every saree holds a story."],
      };
      const node = await renderBlock({ type: "story-editorial", props });
      expect(node).toBeDefined();
    });

    it("editor schema field type for climaxLines is list-of-text (FT-12)", () => {
      const schema = BLOCK_EDITOR_SCHEMAS["story-editorial"];
      expect(schema.fields.climaxLines.meta.type).toBe("list-of-text");
    });
  });

  describe("story-editorial: beats[].paragraphs (nested list-of-text → string[])", () => {
    it("list-of-text output for paragraphs (string[]) passes beatSchema inside storyEditorialPropsSchema", () => {
      // Simulate editor producing beats with string[] paragraphs
      const editorOutput = {
        beats: [
          {
            paragraphs: ["First paragraph.", "Second paragraph."],
            layout: "image-right",
          },
        ],
      };
      const result = storyEditorialPropsSchema.safeParse(editorOutput);
      expect(result.success).toBe(true);
    });

    it("renderBlock does NOT throw with beats using string[] paragraphs (list-of-text shape)", async () => {
      const props = {
        beats: [
          { paragraphs: ["First.", "Second."], layout: "text-only-dark" },
        ],
      };
      const node = await renderBlock({ type: "story-editorial", props });
      expect(node).toBeDefined();
    });

    it("editor schema nested paragraphs field type is list-of-text (FT-12)", () => {
      const schema = BLOCK_EDITOR_SCHEMAS["story-editorial"];
      const beatsItemSchema = schema.fields.beats.meta.itemSchema;
      expect(beatsItemSchema).toBeDefined();
      expect(beatsItemSchema!.fields.paragraphs.meta.type).toBe("list-of-text");
    });
  });
});
