/**
 * P3-10: Homepage blocks fixture.
 *
 * This file maps each current hardcoded homepage section (app/(site)/page.tsx)
 * to its corresponding block type from the closed registry
 * (lib/content/blocks/registry.ts).
 *
 * DESIGN DECISIONS:
 *   - Only existing registered block types are used (no new blocks invented).
 *   - Sections with no registered block equivalent are OMITTED from this fixture
 *     and documented as ACCEPTABLE DELTAS (see UNMAPPED SECTIONS below).
 *   - Copy is taken verbatim from the hardcoded components to maximise
 *     equivalence; image UUIDs are omitted since no media rows exist yet.
 *
 * UNMAPPED SECTIONS (no registered block — out of scope for P3-10):
 *   - TrustSignals: 3-stat static row (components/sections/trust-signals.tsx).
 *     No "trust-signals" block in registry. Deferred.
 *   - HowItWorks: 3-step process grid (components/sections/how-it-works.tsx).
 *     No "how-it-works" block in registry. Deferred.
 *   - FeaturedCollection: bento-grid layout with a feature card.
 *     Approximated by "product-grid" with source="featured". Layout delta is
 *     documented (bento → standard grid); content (featured products) is
 *     equivalent.
 *   - StoryNarrative: receives dynamic product images from
 *     selectStoryNarrativeImages and has GSAP animations. The story-editorial
 *     block is static and uses no image UUIDs (images deferred). Narrative
 *     TEXT content is preserved verbatim; animation/image delta is documented.
 *
 * SECTION ORDER (matches page.tsx order):
 *   1. Hero (hero block) — maps HeroSection
 *   2. Story editorial (story-editorial block) — maps StoryNarrative
 *      [3. TrustSignals — OMITTED: no block]
 *   4. Featured products (product-grid block, source=featured) — maps FeaturedCollection
 *      [5. HowItWorks — OMITTED: no block]
 *   6. Newsletter (newsletter-signup block) — maps Newsletter
 *
 * This fixture is consumed by:
 *   - app/(site)/page.tsx when FTT_FEATURE_BLOCKS_HOMEPAGE=true (flag-on render)
 *   - tests/unit/homepage-blocks.test.ts (equivalence + integrity tests)
 *   - scripts/seed-homepage-cms.ts (build-not-run DB seed)
 */

export type HomepageBlock = {
  type: string;
  props: Record<string, unknown>;
};

/**
 * Ordered array of blocks that represent the homepage content.
 * Used by the flag-on render path via the REAL renderBlock dispatcher.
 */
export const HOMEPAGE_BLOCKS: HomepageBlock[] = [
  // ── 1. HERO ────────────────────────────────────────────────────────────────
  // Maps: HeroSection in app/(site)/page.tsx line 49
  // Copy taken from components/sections/hero-section.tsx defaults (lines 87-94)
  // and from metadata (app/(site)/page.tsx lines 17-21).
  // backgroundImage omitted: no media UUID exists for /media/home-cover.png yet.
  {
    type: "hero",
    props: {
      eyebrow: "From the Trunk",
      headline: "Pre-loved luxury sarees with provenance.",
      subtitle:
        "Curated heirloom pieces, authenticated and restored with care, each carrying the story that made it timeless.",
      primaryCtaLabel: "Explore the Collection",
      primaryCtaHref: "/collection",
      secondaryCtaLabel: "Read the Story",
      secondaryCtaHref: "/our-story",
      infoCardEyebrow: "New Arrivals",
      infoCardTitle: "Curated designer sarees from the 1980s-2000s.",
      infoCardBody: "Limited drops every fortnight. Reserve your piece early.",
      minHeight: "90vh",
    },
  },

  // ── 2. STORY EDITORIAL ─────────────────────────────────────────────────────
  // Maps: StoryNarrative (embedded=true) in app/(site)/page.tsx line 50
  // Copy taken verbatim from components/sections/story-narrative.tsx:
  //   beats (lines 39-66), climaxLines (lines 68-89).
  // Images omitted: StoryNarrative receives dynamic product images
  // (selectStoryNarrativeImages) — no static UUIDs available. ACCEPTABLE DELTA.
  // Animations omitted: StoryNarrative uses GSAP; story-editorial is static. ACCEPTABLE DELTA.
  {
    type: "story-editorial",
    props: {
      beats: [
        {
          paragraphs: [
            "There’s something quietly powerful about a saree. It carries more than fabric — it holds memories, milestones, and moments that once meant everything.",
            "In so many homes, these beautiful pieces lie tucked away, preserved but forgotten.",
          ],
          layout: "image-right",
        },
        {
          paragraphs: [
            "From the Trunk was born from a simple, heartfelt belief: these sarees still have stories left to tell.",
          ],
          layout: "text-only-dark",
        },
        {
          paragraphs: [
            "By giving your pre-loved sarees a second life, you’re not just clearing space — you’re passing on heritage, emotion, and craftsmanship.",
            "Each saree becomes a bridge between past and present, finding new meaning in someone else’s journey.",
          ],
          layout: "image-left",
        },
        {
          paragraphs: [
            "And in doing so, you’re also making a conscious, sustainable choice — reducing waste while celebrating timeless fashion.",
          ],
          layout: "full-bleed",
        },
      ],
      climaxLines: [
        "At From the Trunk, we don’t just collect sarees.",
        "We honor them.",
        "We preserve their stories.",
        "And we help them be loved all over again.",
      ],
      ctaLabel: "Explore the Collection",
      ctaHref: "/collection",
    },
  },

  // NOTE: TrustSignals (position 3 in page.tsx) is OMITTED — no registered
  // block equivalent. See UNMAPPED SECTIONS above.

  // ── 4. FEATURED PRODUCTS GRID ──────────────────────────────────────────────
  // Maps: FeaturedCollection in app/(site)/page.tsx line 52
  // Uses product-grid block with source="featured" (same data source as
  // getFeaturedProducts(4) called in the hardcoded page).
  // ACCEPTABLE DELTA: FeaturedCollection uses a BentoGrid layout with a feature
  // card; product-grid uses a standard grid. Content (products) is equivalent.
  // Copy taken from featured-collection.tsx (lines 88-101):
  //   eyebrow: content?.featuredEyebrow ?? "Featured Collection"
  //   heading: content?.featuredTitle ?? "Curated treasures for the season"
  //   body: content?.featuredBody ?? "Every piece is authenticated..."
  //   ctaLabel: content?.featuredCtaLabel ?? "View All Sarees"
  //   ctaHref: content?.featuredCtaHref ?? "/collection"
  {
    type: "product-grid",
    props: {
      eyebrow: "Featured Collection",
      heading: "Curated treasures for the season",
      body: "Every piece is authenticated and hand-selected from private wardrobes, couture houses, and archive trunks.",
      ctaLabel: "View All Sarees",
      ctaHref: "/collection",
      source: "featured",
      limit: 4,
      layout: "grid",
      columns: "4",
    },
  },

  // NOTE: HowItWorks (position 5 in page.tsx) is OMITTED — no registered
  // block equivalent. See UNMAPPED SECTIONS above.

  // ── 6. NEWSLETTER ──────────────────────────────────────────────────────────
  // Maps: Newsletter in app/(site)/page.tsx line 54
  // Copy taken from components/sections/newsletter.tsx defaults (lines 32-36):
  //   eyebrow: eyebrow ?? "Private Drops"
  //   heading: heading ?? "Be the first to discover new arrivals"
  //   body: body ?? "Receive curated drops and stories from the trunk..."
  {
    type: "newsletter-signup",
    props: {
      eyebrow: "Private Drops",
      heading: "Be the first to discover new arrivals",
      body: "Receive curated drops and stories from the trunk, delivered once a fortnight.",
      inputPlaceholder: "Enter your email",
      buttonLabel: "Join the list",
      background: "card",
    },
  },
];
