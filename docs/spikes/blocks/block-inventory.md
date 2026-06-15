# P3-00 Block Inventory — v1 Block Set

**Spike date:** 2026-06-13  
**Author:** implementation-worker (automated analysis)  
**Status:** findings complete — feeds P3-02 spec  
**Packet:** P3-00

---

## 1. Site Section Catalogue

Every visual section currently rendered on the storefront, with source file:line.

### 1.1 Home page (`app/(site)/page.tsx`)

| Order | Section | Component | Source |
|---|---|---|---|
| 1 | Full-bleed hero with image, eyebrow, headline, subtitle, dual CTA, info card | `HeroSection` | `app/(site)/page.tsx:49`, `components/sections/hero-section.tsx:1` |
| 2 | Brand story editorial — image+text beats with GSAP scroll animation | `StoryNarrative` (embedded=true) | `app/(site)/page.tsx:50`, `components/sections/story-narrative.tsx:1` |
| 3 | Stat row — 3 icon+value+label trust signals | `TrustSignals` | `app/(site)/page.tsx:51`, `components/sections/trust-signals.tsx:1` |
| 4 | Featured product bento grid with section header + CTA | `FeaturedCollection` | `app/(site)/page.tsx:52`, `components/sections/featured-collection.tsx:1` |
| 5 | 3-step process grid with image cards | `HowItWorks` | `app/(site)/page.tsx:53`, `components/sections/how-it-works.tsx:1` |
| 6 | Newsletter signup card | `Newsletter` | `app/(site)/page.tsx:54`, `components/sections/newsletter.tsx:1` |

### 1.2 Our Story page (`app/(site)/our-story/page.tsx`)

| Order | Section | Implementation | Source |
|---|---|---|---|
| 1 | Full-bleed hero with eyebrow + serif headline over image overlay | Inline JSX | `app/(site)/our-story/page.tsx:61-80` |
| 2 | Rich-text section: heading + paragraph body | Inline JSX | `app/(site)/our-story/page.tsx:82-93` |
| 3 | 3-card grid (title + body per card) | Inline JSX using `Card` | `app/(site)/our-story/page.tsx:95-109` |
| 4 | Rich-text section: heading + multi-paragraph body | Inline JSX | `app/(site)/our-story/page.tsx:112-153` |

### 1.3 Our Why page (`app/(site)/why/page.tsx`)

| Order | Section | Component | Source |
|---|---|---|---|
| 1 | Cinematic hero + tabbed chapter navigator with voiceover | `OurWhyExperience` | `app/(site)/why/page.tsx:22`, `components/sections/our-why-experience.tsx:1` |
| 2 | 3-column proof-point grid (icon + title + body) | Inside `OurWhyExperience` | `components/sections/our-why-experience.tsx:284-299` |

### 1.4 How It Works page (`app/(site)/how-it-works/page.tsx`)

| Order | Section | Implementation | Source |
|---|---|---|---|
| 1 | Eyebrow + h1 + paragraph intro | Inline JSX | `app/(site)/how-it-works/page.tsx:66-79` |
| 2 | Numbered step cards (title + separator + body, iterated) | Inline JSX using `Card`, `Separator` | `app/(site)/how-it-works/page.tsx:81-101` |

### 1.5 Collection listing page (`app/(site)/collection/page.tsx`)

| Order | Section | Implementation | Source |
|---|---|---|---|
| 1 | Split hero: left=image+stats overlay, right=filter panel | Inline JSX | `app/(site)/collection/page.tsx:144-294` |
| 2 | Product grid (2-col mobile, 3-col desktop), paginated | Inline JSX using `ProductCard` | `app/(site)/collection/page.tsx:322-363` |

### 1.6 PDP — `/collection/[slug]` (`app/(site)/collection/[slug]/page.tsx`)

| Order | Section | Implementation | Source |
|---|---|---|---|
| 1 | Split layout: left=gallery, right=name+price+CTA+story | Inline JSX + `ProductGallery` | `app/(site)/collection/[slug]/page.tsx:171-264` |
| 2 | Accordion: Product Details + Care Instructions | Inline JSX using `Accordion` | `app/(site)/collection/[slug]/page.tsx:239-263` |
| 3 | Related products grid (scored by era/fabric/tag) | Inline JSX using `ProductCard` | `app/(site)/collection/[slug]/page.tsx:267-287` |

### 1.7 Policy pages (`privacy-policy`, `return-policy`, `shipping-policy`, `packing`, `terms-of-service`)

All use the same layout pattern: eyebrow + h1 + `<section>` blocks of heading + prose body. No dedicated component — purely inline JSX using Tailwind prose classes.

Source reference: `app/(site)/privacy-policy/page.tsx:10-73`, `app/(site)/return-policy/page.tsx:10-71`.

### 1.8 Global chrome

| Element | Component | Source |
|---|---|---|
| Announcement bar (sticky top, full-width, message + link) | `AnnouncementBar` | `components/layout/announcement-bar.tsx:1`, used in `components/layout/site-header.tsx` |
| Site header (logo + nav + cart) | `SiteHeader` | `components/layout/site-header.tsx:1` |
| Site footer (logo + link groups + socials) | `SiteFooter` | `components/layout/site-footer.tsx:1` |

### 1.9 Unused in current pages but present in `components/sections/`

| Component | File | Purpose |
|---|---|---|
| `BrandStoryTeaser` | `components/sections/brand-story-teaser.tsx` | Image+text split teaser with CTA — not currently mounted on any page |
| `StoryNarrative` (standalone) | `components/sections/story-narrative.tsx` | Used embedded on home; the full standalone version (with hero + beats + climax) was previously the `/our-story` content. Now the story page uses inline JSX instead. |

---

## 2. v1 Block Set — Canonical Definitions

Each block follows the closed-registry contract: `{ type, propsSchema (zod), Renderer (RSC), editorMeta }` per master-plan §3.2.

Field types refer to the P2-01 canonical set (FT-01 through FT-11) documented in `docs/spikes/form-engine.md §3`.

Token references come from `docs/design-system.md`. Blocks consume CSS variables only — no raw hex or brand aliases in Renderer code.

---

### BLOCK-01 `hero`

**Mapped from:** `HeroSection` (`components/sections/hero-section.tsx:34`)  
**Also covers:** the inline hero in `app/(site)/our-story/page.tsx:61-80`, the collection page hero at `app/(site)/collection/page.tsx:144`

**propsSchema (zod):**

```ts
z.object({
  eyebrow:            z.string().max(80).optional(),       // FT-01 text
  headline:           z.string().max(200),                 // FT-01 text
  subtitle:           z.string().max(400).optional(),      // FT-02 textarea
  backgroundImage:    z.string().uuid().optional(),        // FT-09 image-ref (single)
  primaryCtaLabel:    z.string().max(60).optional(),       // FT-01 text
  primaryCtaHref:     z.string().max(300).optional(),      // FT-01 text
  secondaryCtaLabel:  z.string().max(60).optional(),       // FT-01 text
  secondaryCtaHref:   z.string().max(300).optional(),      // FT-01 text
  infoCardEyebrow:    z.string().max(80).optional(),       // FT-01 text
  infoCardTitle:      z.string().max(120).optional(),      // FT-01 text
  infoCardBody:       z.string().max(300).optional(),      // FT-02 textarea
  minHeight:          z.enum(["60vh", "80vh", "90vh", "100vh"]).default("90vh"), // FT-06 select
})
```

**Theme tokens consumed:**
- `--background`, `--foreground`, `--primary`, `--primary-foreground`
- `bg-luxury-fade` (background-image token, `docs/design-system.md §5`)
- `shadow-soft`, `shadow-lift`
- `font-serif`, `font-sans`

**Structured data:** None. (Hero text is not FAQ/product data.)

**editorMeta:** label="Hero", icon="layout-panel-top", maxPerPage=1 (recommended limit)

---

### BLOCK-02 `rich-text`

**Mapped from:** policy pages (`app/(site)/privacy-policy/page.tsx:12-73`), "Our Trunk Journey" section (`app/(site)/our-story/page.tsx:82-93`), "Why we do what we do" section (`app/(site)/our-story/page.tsx:112-153`), How It Works intro (`app/(site)/how-it-works/page.tsx:66-79`)

**propsSchema (zod):**

```ts
z.object({
  eyebrow:   z.string().max(80).optional(),   // FT-01 text
  heading:   z.string().max(200).optional(),  // FT-01 text
  body:      z.string().max(8000),            // FT-03 rich-text (HTML/Markdown)
  align:     z.enum(["left", "center"]).default("left"),  // FT-06 select
  maxWidth:  z.enum(["prose", "wide", "full"]).default("prose"), // FT-06 select
})
```

**Theme tokens consumed:**
- `--foreground`, `--muted-foreground`
- `--border` (for `prose` container)
- `font-serif` (headings), `font-sans` (body)

**Structured data:** None.

**editorMeta:** label="Rich Text", icon="text", maxPerPage=unbounded

---

### BLOCK-03 `image-text-split`

**Mapped from:** `BrandStoryTeaser` (`components/sections/brand-story-teaser.tsx:10`), individual beats inside `StoryNarrative` (`components/sections/story-narrative.tsx:344-386`), `OurWhyExperience` aside layout (`components/sections/our-why-experience.tsx:167`)

**propsSchema (zod):**

```ts
z.object({
  eyebrow:      z.string().max(80).optional(),   // FT-01 text
  heading:      z.string().max(200),             // FT-01 text
  body:         z.string().max(2000),            // FT-03 rich-text
  image:        z.string().uuid(),               // FT-09 image-ref (single)
  imageAlt:     z.string().max(200).optional(),  // FT-01 text
  imagePosition: z.enum(["left", "right"]).default("right"),  // FT-06 select
  ctaLabel:     z.string().max(60).optional(),   // FT-01 text
  ctaHref:      z.string().max(300).optional(),  // FT-01 text
  background:   z.enum(["transparent", "secondary", "muted"]).default("transparent"), // FT-06 select
})
```

**Theme tokens consumed:**
- `--foreground`, `--muted-foreground`, `--secondary`, `--muted`
- `--border`
- `shadow-soft`
- `font-serif`, `font-sans`
- `rounded-3xl` (image container)

**Structured data:** None.

**editorMeta:** label="Image + Text", icon="layout-panel-left", maxPerPage=unbounded

---

### BLOCK-04 `product-grid`

**Mapped from:** `FeaturedCollection` (`components/sections/featured-collection.tsx:24`), product grid in `app/(site)/collection/page.tsx:322`, related products in `app/(site)/collection/[slug]/page.tsx:267`, `HowItWorks` image cards (`components/sections/how-it-works.tsx:30`)

**propsSchema (zod):**

```ts
z.object({
  eyebrow:        z.string().max(80).optional(),     // FT-01 text
  heading:        z.string().max(200).optional(),    // FT-01 text
  body:           z.string().max(500).optional(),    // FT-02 textarea
  ctaLabel:       z.string().max(60).optional(),     // FT-01 text
  ctaHref:        z.string().max(300).optional(),    // FT-01 text
  source:         z.enum(["collection", "tag", "manual", "featured"]), // FT-06 select
  collectionSlug: z.string().max(120).optional(),    // FT-01 text — required when source=collection
  tagName:        z.string().max(120).optional(),    // FT-01 text — required when source=tag
  productIds:     z.array(z.string().uuid()).max(12).optional(), // FT-07 multi-select — required when source=manual
  limit:          z.number().int().min(1).max(12).default(4),   // FT-04 number
  layout:         z.enum(["grid", "bento"]).default("grid"),    // FT-06 select
  columns:        z.enum(["2", "3", "4"]).default("3"),         // FT-06 select
})
```

**Theme tokens consumed:**
- `--foreground`, `--muted-foreground`, `--card`, `--border`
- `shadow-soft`, `shadow-lift`
- `--trunk-gold` (hover border accent via `hover:border-trunk-gold/40`)
- `font-serif`, `font-sans`
- `rounded-2xl`

**Structured data:** Product and BreadcrumbList JSON-LD is already handled per-product on the PDP. The grid block does not emit additional structured data (products are discoverable via `sitemap.xml` + individual PDP schema).

**Note on renderer:** The P3 public renderer reads published products via the existing `getProducts()` / `getProductsByCollection()` / `getFeaturedProducts()` data functions. No new data port needed for v1. `source=manual` requires `productIds` and fetches via `getProductBySlug()` for each.

**editorMeta:** label="Product Grid", icon="grid-2x2", maxPerPage=unbounded

---

### BLOCK-05 `story-editorial`

**Mapped from:** `StoryNarrative` (`components/sections/story-narrative.tsx:93`), `OurWhyExperience` main section (`components/sections/our-why-experience.tsx:89`)

This is the high-production editorial block: multi-beat image+text narrative with scroll animation, optionally a "climax" text finale. For v1, simplified to a static ordered list of beats without GSAP animation (animation is progressive enhancement — P3 does not require it).

**propsSchema (zod):**

```ts
const BeatSchema = z.object({
  paragraphs: z.array(z.string().max(600)).min(1).max(4), // FT-10 list-of-group inner
  image:      z.string().uuid().optional(),               // FT-09 image-ref
  imageAlt:   z.string().max(200).optional(),             // FT-01 text
  layout:     z.enum(["image-right", "image-left", "text-only-dark", "full-bleed"]), // FT-06 select
});

z.object({
  beats:        z.array(BeatSchema).min(1).max(6),     // FT-10 list-of-group
  climaxLines:  z.array(z.string().max(200)).max(6).optional(), // FT-10 list-of-group (text-only)
  ctaLabel:     z.string().max(60).optional(),         // FT-01 text
  ctaHref:      z.string().max(300).optional(),        // FT-01 text
})
```

**Theme tokens consumed:**
- `--foreground`, `--muted-foreground`, `--primary-foreground`, `--background`
- `font-serif`
- No shadow tokens (full-bleed sections use image overlays)

**Structured data:** None.

**editorMeta:** label="Story / Editorial", icon="book-open", maxPerPage=1 (one per page is the sensible limit — it is a heavy section)

---

### BLOCK-06 `faq`

**Mapped from:** The `Accordion` usage on the PDP (`app/(site)/collection/[slug]/page.tsx:239-263`) is the direct in-codebase precedent for accordion-based Q&A. No standalone FAQ section page exists yet — this block creates one. The P3 plan at `plans/P3-content-theming.md:40` explicitly lists FAQ with FAQPage JSON-LD.

**propsSchema (zod):**

```ts
const FAQItemSchema = z.object({
  question: z.string().max(300),   // FT-01 text
  answer:   z.string().max(2000),  // FT-03 rich-text
});

z.object({
  eyebrow: z.string().max(80).optional(),    // FT-01 text
  heading: z.string().max(200).optional(),   // FT-01 text
  items:   z.array(FAQItemSchema).min(1).max(20), // FT-10 list-of-group
})
```

**Theme tokens consumed:**
- `--foreground`, `--muted-foreground`, `--border`
- `--card`, `--background`
- `font-serif` (heading), `font-sans` (Q&A text)
- `rounded-lg` (accordion container)

**Structured data: FAQPage JSON-LD — required.**

The Renderer emits a `<script type="application/ld+json">` block following the existing pattern in `lib/seo/json-ld.ts` (see `productJsonLd` at line ~1 for the pattern):

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "<question>",
      "acceptedAnswer": { "@type": "Answer", "text": "<answer>" }
    }
  ]
}
```

The rendered-output test pattern for JSON-LD is established at `tests/unit/json-ld-render.test.ts` — the FAQ block's structured data must follow the same test pattern (a unit test asserting schema.org type + item count).

**editorMeta:** label="FAQ", icon="message-circle-question", maxPerPage=unbounded

---

### BLOCK-07 `newsletter-signup`

**Mapped from:** `Newsletter` (`components/sections/newsletter.tsx:12`)

**propsSchema (zod):**

```ts
z.object({
  eyebrow:         z.string().max(80).optional(),   // FT-01 text
  heading:         z.string().max(200),             // FT-01 text
  body:            z.string().max(400).optional(),  // FT-02 textarea
  inputPlaceholder: z.string().max(80).default("Enter your email"), // FT-01 text
  buttonLabel:     z.string().max(60).default("Join the list"),     // FT-01 text
  background:      z.enum(["card", "secondary", "transparent"]).default("card"), // FT-06 select
})
```

The `Newsletter` component itself is a client component (calls `/api/v2/newsletter/subscribe`). The Renderer for this block can import `Newsletter` as a client island — the RSC wraps it with the props above.

**Theme tokens consumed:**
- `--card`, `--foreground`, `--muted-foreground`, `--border`
- `--secondary`
- `shadow-soft`
- `font-serif` (heading), `font-sans` (body + input)
- `rounded-2xl`

**Structured data:** None.

**editorMeta:** label="Newsletter Signup", icon="mail", maxPerPage=1

---

### BLOCK-08 `announcement-bar`

**Mapped from:** `AnnouncementBar` (`components/layout/announcement-bar.tsx:3`)

Currently this is rendered at the layout level (hardcoded in `SiteHeader`). As a block it becomes page-level-overrideable for campaign pages, but can also be managed as a global setting (the master-plan `theme_settings` singleton). For v1 the block is the editor-managed incarnation that overrides/supplements the global one.

**propsSchema (zod):**

```ts
z.object({
  messages:   z.array(z.string().max(200)).min(1).max(5), // FT-10 list-of-group (simple strings)
  ctaLabel:   z.string().max(60).optional(),              // FT-01 text
  ctaHref:    z.string().max(300).optional(),             // FT-01 text
  background: z.enum(["primary", "accent", "foreground"]).default("primary"), // FT-06 select
})
```

**Theme tokens consumed:**
- `--primary`, `--primary-foreground`
- `--accent`, `--accent-foreground`
- `--foreground`, `--background`
- `font-sans`
- `tracking-[0.08em]` (letter-spacing — Tailwind default scale applies)

**Structured data:** None.

**editorMeta:** label="Announcement Bar", icon="megaphone", maxPerPage=1, note="Typically placed as the first block of a page template"

---

### BLOCK-09 `spacer`

**Mapped from:** Implicit — the `gap-20` spacing in `app/(site)/page.tsx:48` between sections. No dedicated component; this block provides explicit editorial control over vertical rhythm.

**propsSchema (zod):**

```ts
z.object({
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  // sm=h-8, md=h-16, lg=h-24, xl=h-32  (Tailwind scale, no arbitrary px)
  showDivider: z.boolean().default(false), // FT-08 boolean — renders <hr> with --border color
})
```

**Theme tokens consumed:**
- `--border` (when `showDivider=true`)
- Standard Tailwind height scale

**Structured data:** None.

**editorMeta:** label="Spacer / Divider", icon="separator-horizontal", maxPerPage=unbounded

---

## 3. v1 Block Set Summary Table

| # | Block type | propsSchema field count | FT types used | JSON-LD | RSC? | Source section |
|---|---|---|---|---|---|---|
| 01 | `hero` | 12 | FT-01×7, FT-02×1, FT-06×1, FT-09×1 | No | Yes | `hero-section.tsx:34` |
| 02 | `rich-text` | 5 | FT-01×2, FT-03×1, FT-06×2 | No | Yes | `privacy-policy/page.tsx:19` |
| 03 | `image-text-split` | 9 | FT-01×4, FT-03×1, FT-06×2, FT-09×1 | No | Yes | `brand-story-teaser.tsx:10` |
| 04 | `product-grid` | 11 | FT-01×4, FT-02×1, FT-04×1, FT-06×3, FT-07×1 | No (PDP handles it) | Yes | `featured-collection.tsx:24` |
| 05 | `story-editorial` | 3 (+ nested) | FT-01×2, FT-06×1, FT-09×1, FT-10×2 | No | Yes | `story-narrative.tsx:93` |
| 06 | `faq` | 3 (+ nested) | FT-01×2, FT-03×1, FT-10×1 | **FAQPage** | Yes | PDP accordion `[slug]/page.tsx:239` |
| 07 | `newsletter-signup` | 6 | FT-01×4, FT-02×1, FT-06×1 | No | Hybrid (RSC shell + client island) | `newsletter.tsx:12` |
| 08 | `announcement-bar` | 4 | FT-01×2, FT-06×1, FT-10×1 | No | Yes (client: none needed for static text) | `announcement-bar.tsx:3` |
| 09 | `spacer` | 2 | FT-06×1, FT-08×1 | No | Yes | implicit gap in `page.tsx:48` |

---

## 4. Closed-Registry Contract (per master-plan §3.2)

Each block file in `lib/content/blocks/` must export exactly:

```ts
import type { ZodTypeAny } from "zod";
import type { ReactNode } from "react";

export type BlockRegistryEntry = {
  /** Discriminant stored in the `blocks` jsonb array. Immutable once shipped. */
  type: string;
  /** Zod schema for the block's props. Used on save AND render (defense in depth). */
  propsSchema: ZodTypeAny;
  /**
   * React Server Component renderer. Receives validated props + optional context
   * (page slug, draft mode flag). Must consume theme tokens only — no raw hex,
   * no arbitrary px (drift rules §8 of design-system.md apply).
   */
  Renderer: (props: Record<string, unknown>) => ReactNode | Promise<ReactNode>;
  /** Metadata consumed by the P3-05 block composer UI. */
  editorMeta: {
    label: string;
    icon: string;         // Lucide icon name
    maxPerPage?: number;  // Omit = unlimited
    note?: string;
  };
};
```

Registry file: `lib/content/blocks/registry.ts` — exports a `Map<string, BlockRegistryEntry>`. Adding a block = one new file + one `registry.set(entry.type, entry)` call.

---

## 5. Token Consumption Notes for P3-02

The following tokens are consumed across 5+ blocks and must be treated as load-bearing in any P3-07 theme editor:

| Token | Used by blocks | Role |
|---|---|---|
| `--foreground` | 01-09 (all) | Primary text |
| `--muted-foreground` | 01-08 | Secondary / de-emphasised text |
| `--primary` | 01, 07, 08 | CTA buttons, announcement bar bg |
| `--primary-foreground` | 01, 08 | Text on primary surfaces |
| `--card` | 04, 07 | Card background |
| `--border` | 02, 03, 04, 06, 07, 09 | Separators, accordion, divider |
| `--secondary` | 03, 07 | Soft background sections |
| `--accent` | 08 | Alternate announcement bar bg |
| `font-serif` (Cormorant Garamond) | 01-07 (all except spacer) | Headings, editorial text |
| `shadow-soft` | 01, 03, 04, 07 | Card elevation |
| `shadow-lift` | 01, 04 | Hover elevation on cards |

---

## 6. Decisions Recorded

**D-B1 (2026-06-13):** `product-grid` source enum includes `"featured"` (maps to `getFeaturedProducts()`) to support the homepage section without forcing editors to manually curate a manual list. This is an additive source type beyond the three named in the task spec.

**D-B2 (2026-06-13):** `story-editorial` is kept as a single block (not split into individual beat blocks) because the GSAP animation and layout variants are tightly coupled. The `beats` array (FT-10 list-of-group) handles the repeatable content. Breaking into atomic blocks would require a nested block system not planned for P3 v1.

**D-B3 (2026-06-13):** `announcement-bar` as a block is supplementary to the layout-level `AnnouncementBar` component. The migration strategy is: P3-08 adds the block; P3-10 (page migration) decides whether to wire it to theme_settings as a global instead. The block spec does not remove the layout component — that is a P3-09/P3-10 decision.

**D-B4 (2026-06-13):** `newsletter-signup` Renderer is RSC shell + client island (the form's `handleSubmit` requires client interactivity). The RSC passes only serialisable props to the client component. This is the same pattern used in `FeaturedCollection` (RSC) calling `BentoCard` (client).

---

## 7. Self-Review

| Coverage point | Status | Evidence |
|---|---|---|
| Every visual section on current site catalogued | Complete | 6 home sections, 4 story sections, 2 why sections, 2 how-it-works sections, 5 collection/PDP sections, 1 global chrome type — 20+ section instances mapped |
| v1 block set confirmed/adjusted against real site | Complete | 9 blocks; added `story-editorial` (covers the prominent `StoryNarrative` + `OurWhyExperience` sections not in initial spec); separated from `image-text-split` because of structural complexity |
| Props typed, mapped to P2-01 FT types | Complete | All 9 propsSchemas written with FT annotation per field |
| Theme tokens per block | Complete | Tokens cited from `docs/design-system.md` for all 9 blocks; load-bearing tokens summarised in §5 |
| Structured data noted | Complete | `faq` block requires FAQPage JSON-LD (only block with structured data requirement); pattern references existing `lib/seo/json-ld.ts` + `tests/unit/json-ld-render.test.ts` |
| product-grid source variants | Complete | `collection`, `tag`, `manual`, `featured` — each with conditional required field noted |
| closed-registry contract | Complete | TypeScript `BlockRegistryEntry` type written; matches master-plan §3.2 description |
| file:line citations | Complete | Every section cite includes file path and line number from the read source |
| FAQ JSON-LD test reference | Complete | Points to existing `tests/unit/json-ld-render.test.ts` pattern |
| Gaps or open questions | 1 gap | `announcement-bar` is currently hardcoded in layout; the relationship between block vs. global theme_settings must be resolved in P3-07/P3-09. Recorded as D-B3. |
