# FTT - Crimson Heritage Design System

### 1. Overview & Creative North Star

**Creative North Star: "The Modern Atelier"**
Crimson Heritage is a design system built for high-end commerce and editorial storytelling. It rejects the sterility of modern SaaS interfaces in favor of warmth, tactile luxury, and academic precision. By blending a deep, historic burgundy with creamy, parchment-like neutrals and elegant, wide-tracked typography, the system evokes the feeling of a bespoke physical experience—like a leather-bound ledger or a curated gallery.

The system breaks the "template" look through:

- **Intentional Asymmetry:** Generous, uneven whitespace that allows content to breathe.
- **Tonal Layering:** Replacing rigid lines with shifts in warm-toned surfaces.
- **Typographic Authority:** Using high-contrast serif displays (Newsreader) paired with ultra-wide sans-serif labels (Inter).

### 2. Colors

The palette is rooted in Earth and Tradition, matching the FTT application styles.

- **Primary (Deep Burgundy - #6B1D1D):** Reserved for high-intent actions, progress indicators, and brand signifiers. Lightens to `#f9f5ed` for primary foreground text.
- **Surface & Background (Warm Cream - #F5F0E8):** A soft, non-white foundation that reduces eye strain and adds a "premium paper" quality.
- **Text & Foreground (Dark Espresso - #2E2017):** Pure black (#000000) is strictly prohibited. Espresso brings warmth to typography without losing legibility.
- **Card Surface & Popovers (#FAF6F0):** Slightly lighter than the main background, used to visually elevate content containers.
- **Accent Gold (#B8860B):** Used sparingly for "Trust" symbols and subtle highlights.
- **Secondary & Muted Tones (#E9E0D2 / #EFE6D8):** Soft sand tones used for secondary backgrounds and disabled/muted states.
- **Borders & Inputs (#DCCBB7):** A warm light tan used when delicate structural lines are necessary.

### 3. Typography

The system uses a sophisticated pairing of **Newsreader** (Serif) and **Inter** (Sans-serif) to balance heritage with modern utility.

**Typography Scale:**

- **Display / H1:** Newsreader Bold. Reserved for brand identity and hero statements.
- **Headline:** Newsreader SemiBold. Used for section titles.
- **Title:** Newsreader Medium/Bold. For card headings and summaries.
- **Body:** Inter. Optimized for readability with comfortable line height.
- **Labels:** Inter Bold. **Rule:** Must always use luxury tracking (wide letter spacing) and uppercase transformation. This is the hallmark of the system’s "Editorial" feel.

### 4. Elevation & Depth

Elevation in Crimson Heritage is subtle, atmospheric, and avoids harsh lines.

- **The Layering Principle:** Depth is created by "stacking" varying light/warm tones. A card (`#FAF6F0`) sits effortlessly on the cream background (`#F5F0E8`).
- **Shadow Tokens:** The system uses two specific elegant shadow tiers defined in the config:
  - **Soft Elevation (shadow-soft):** `0 20px 60px -40px rgba(0, 0, 0, 0.45)`. Used for standard cards, containers, and general floating items.
  - **Lift / Deep Focus (shadow-lift):** `0 12px 30px -18px rgba(0, 0, 0, 0.6)`. Used for hover states or highly elevated modals (like the Order Summary).
- **Luxury Fade:** Use the custom `luxury-fade` background gradient (`linear-gradient(135deg, rgba(15, 8, 6, 0.85), rgba(49, 26, 19, 0.5), rgba(245, 240, 232, 0.15))`) for rich image overlays or dark mode transitions.

### 5. Components

- **Buttons:** Primary buttons are pill-shaped/fully rounded with deep burgundy backgrounds and soft elevated shadows. Text is kept clean and clear.
- **Inputs & Outlines:** Inputs are softly rounded (Base Radius: `0.75rem / 12px`) with a 1px border in `border/input` (`#DCCBB7`). Focus and ring states transition to a `primary` (`#6B1D1D`) colored outline.
- **Cards:** Defined by `card` (`#FAF6F0`) backgrounds, `shadow-soft`, and a 12px/16px corner radius.
- **Structural Lines:** The "No-Line" Rule is encouraged—separation is best achieved through background shifts. If a boundary is required for an input or card, the warm `#DCCBB7` border is used.

### 6. Do's and Don'ts

- **Do:** Use `italic` Newsreader for accent copy or secondary helper text to add a human, editorial touch.
- **Do:** Ensure all "Luxury Labels" have wide letter spacing (tracking) and uppercase styling.
- **Don't:** Use pure black (#000000). Always use **Espresso** (`#2E2017`) for all dark text.
- **Don't:** Use sharp corners for interactive elements. Rely on the system's fully rounded/pill shapes for primary buttons and `0.75rem` radiuses for inputs.
- **Do:** Use `mix-blend-multiply` for product photography on cream backgrounds to remove unsightly white boxes around assets.
