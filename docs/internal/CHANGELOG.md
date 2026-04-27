# FTT Changelog

## 2026-04-27 - v0.26.2, The Living Story Preview

Detailed implementation notes: [v0.26.2 release notes](./releases/v0.26.2.md).

### Added

- **Interactive Our Why preview**: Rebuilt `/why` as a chaptered, image-led
  story experience with slide controls and browser voiceover playback.
- **Admin changelog page**: Added `/admin/changelog` so admins can review the
  detailed fixes and updates for every release.
- **Clickable version badges**: The version badge in the admin menu, top bar,
  dashboard, mobile menu, and release announcement now opens the changelog.

### Updated

- **Homepage readability**: Strengthened the hero image overlay and removed
  above-the-fold reveal dependency so the headline and calls to action are
  readable immediately.
- **Customer card polish**: Removed decorative overlay icons from featured
  collection and how-it-works cards so the saree imagery and text stay calm.
- **Release card depth**: Expanded the admin release announcement and dashboard
  latest-update card with grouped release notes.

### Fixed

- **Customer-facing punctuation**: Removed em dashes, en dashes, and visible
  separator dots from checked storefront surfaces.
- **Scope clarity**: The collection filter redesign is intentionally held for a
  separate planning pass rather than being mixed into this release.

### QA Evidence

- TypeScript: `npx tsc --noEmit --pretty false` passed.
- Unit test: `npm test -- tests/unit/admin-release.test.ts` passed.
- ESLint: targeted storefront and admin release files passed.
- Build: `npm run build` passed.
- Browser QA: `/why`, `/`, `/collection`, `/admin`, and `/admin/changelog`
  checked at desktop and mobile widths.

## 2026-04-24 — v0.25.0, The Showroom Release

### Fixed

- **Public draft exposure** — Anonymous product API requests now ignore
  `includeDrafts=true`, and public product detail lookups no longer return draft
  items.
- **Missing product status** — Unknown `/collection/[slug]` URLs now return a
  real HTTP 404 before product detail streaming can produce a soft 200.
- **Empty collection chips** — Storefront collection filters now only show edits
  that have visible products, so shoppers do not land on empty shelves.
- **Mobile menu accessibility** — Added the missing sheet title for the
  storefront mobile menu.
- **Product editor autosave** — The admin editor now skips autosave when nothing
  has changed, preventing unchanged products from being PATCHed every 30 seconds.

### Updated

- **Collection page mobile polish** — Tightened the hero typography, promo bar,
  stat cards, and mobile text wrapping after visual QA.
- **Admin release experience** — Added an internal version badge and once-per-
  version update dialog for admin users.
- **Dashboard release surface** — Added a compact "Latest update" panel so the
  team can quickly see what changed after each launch.

### QA Evidence

- Unit tests: `120` passed.
- Build: `next build` passed.
- Browser QA: storefront collection desktop/mobile, real 404, public draft
  visibility, admin release popup, product view modes, search, and product-editor
  autosave probe passed.

## 2026-04-05 — Site Feedback Fixes (sprint-abe)

Based on team feedback from Diya, Dr. Meena, and Grace on the live site
(www.fromthetrunk.shop).

### Fixed

- **Instagram link** — Changed from `instagram.com/fromthetrunk` (wrong
  account) to `instagram.com/from.thetrunk` (correct handle).
  File: `components/layout/site-footer.tsx`

- **WhatsApp link** — Replaced placeholder number `910000000000` with real
  number `919731910202`.
  File: `components/layout/site-footer.tsx`

- **Dark mode removed** — Enforced light-mode-only per Diya's feedback that
  light mode looks better and the black FTT logo was invisible in dark mode.
  - Removed `ThemeToggle` from header (`components/layout/site-header.tsx`)
  - Deleted `components/layout/theme-toggle.tsx`
  - Removed `.dark` CSS variable block and `@custom-variant dark` from
    `app/globals.css`

- **Product gallery too tall** — Diya reported having to scroll back down to
  switch images. Reduced main image aspect ratio from `4/5` to `3/4` and made
  the gallery container `sticky top-28` so thumbnails stay visible while
  scrolling product details.
  File: `components/product/product-gallery.tsx`

### Updated

- **Our Story page** — Replaced generic placeholder text with real brand copy
  from the FTT Instagram "Our Trunk Journey" post. Updated hero title, section
  narrative, and all three feature cards (Sourcing, Quality Control,
  Eco-Restoration). Added Akaash's brand philosophy writeup ("Why we do what
  we do") as a dedicated section after the pillars.
  File: `app/(site)/our-story/page.tsx`

- **Homepage brand teaser** — Updated heading and body to match the real FTT
  origin story ("Born in Bengaluru, rooted in heritage").
  File: `components/sections/brand-story-teaser.tsx`

- **How It Works page** — Replaced four generic steps with five real process
  steps from the FTT Instagram "Give Your Saree a Second Story" post: Sourcing,
  Quality Control, Eco-Restoration, Sustainable Packaging, Doorstep Magic.
  Updated page title and subtitle with consignment-style copy.
  File: `app/(site)/how-it-works/page.tsx`

### Added

- **Unit tests** — 25 Vitest tests verifying all link fixes, light-mode
  enforcement, content updates, and gallery changes.
  File: `tests/unit/site-feedback-fixes.test.ts`

- **E2E tests** — 9 Playwright tests verifying the live site renders correct
  links, has no dark toggle, shows real brand content on Our Story / How It
  Works / homepage, and confirms sticky gallery on product pages.
  File: `tests/e2e/site-feedback-fixes.spec.ts`

- **Playwright config** — Added `playwright.config.ts` for e2e testing
  infrastructure.

- **.cursor/rules tracked in git** — Updated `.gitignore` to un-ignore
  `.cursor/rules/` so AI assistant rules are version-controlled while other
  `.cursor/*` files remain ignored.

### Not changed (pending team input)

- Saree pricing (dummy values remain until confirmed)
- Saree descriptions (pending content from team)
- Lifestyle photos (Unsplash placeholders remain until team provides assets)
- Poshmark India listing (business/ops research item)
