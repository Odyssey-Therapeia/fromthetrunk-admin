# FTT Changelog

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
