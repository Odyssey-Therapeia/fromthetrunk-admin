# Design System — From the Trunk

Project-specific design tokens for FTT. This file's STRUCTURE is Tier 2 boilerplate (same in every project); the VALUES are unique to this brand. Tokens are defined in `app/globals.css` `:root` and `tailwind.config.ts`.

## Semantic Color Tokens

Defined in `globals.css` `:root`, bridged to Tailwind via `@theme inline`.

| Token | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| Background | `--background` | `#f5f0e8` | Page background (warm cream) |
| Foreground | `--foreground` | `#2e2017` | Primary text (warm dark brown) |
| Card | `--card` | `#faf6f0` | Card surfaces |
| Card foreground | `--card-foreground` | `#2e2017` | Text on card surfaces |
| Primary | `--primary` | `#6b1d1d` | CTA buttons, links, ring focus (deep burgundy) |
| Primary foreground | `--primary-foreground` | `#f9f5ed` | Text on primary surfaces |
| Secondary | `--secondary` | `#e9e0d2` | Secondary backgrounds, badges |
| Secondary foreground | `--secondary-foreground` | `#2e2017` | Text on secondary surfaces |
| Muted | `--muted` | `#efe6d8` | Disabled states, skeleton fills |
| Muted foreground | `--muted-foreground` | `#6d5a4e` | Subtle text, descriptions, metadata |
| Accent | `--accent` | `#b8860b` | Highlights, gold emphasis (trunk gold) |
| Accent foreground | `--accent-foreground` | `#fdf8ea` | Text on accent surfaces |
| Destructive | `--destructive` | `#b42318` | Error states, delete actions |
| Border | `--border` | `#dccbb7` | Default borders |
| Input | `--input` | `#dccbb7` | Input borders |
| Ring | `--ring` | `#6b1d1d` | Focus ring (matches primary) |

Text selection uses gold overlay: `rgba(184, 134, 11, 0.35)`.

## Brand Palette

Extended colors in `tailwind.config.ts` under `colors.trunk`:

| Token | Tailwind class | Hex | Usage |
|-------|---------------|-----|-------|
| Burgundy | `trunk-burgundy` | `#6B1D1D` | Brand primary, matches `--primary` |
| Gold | `trunk-gold` | `#B8860B` | Brand accent, matches `--accent` |
| Cream | `trunk-cream` | `#F5F0E8` | Brand background, matches `--background` |
| Brown | `trunk-brown` | `#3D2B1F` | Deep contrast, badge text, overlays |

Use the semantic tokens (`bg-primary`, `text-accent`) for UI components. Use `trunk-*` tokens only for brand-specific treatments (logo lockups, marketing sections, badge accents).

## Typography

| Family | CSS variable | Font | Weights | Usage |
|--------|-------------|------|---------|-------|
| Serif | `--font-serif` | Cormorant Garamond | 400, 500, 600, 700 | Headings, product names, editorial text |
| Sans | `--font-sans` | Inter | Variable (100-900) | Body text, UI labels, buttons, metadata |

Tailwind classes: `font-serif` for headings, `font-sans` for everything else. Body sets `font-feature-settings: "liga" 1, "kern" 1` and `text-rendering: optimizeLegibility` globally.

Heading scale (suggested):
- Page title: `font-serif text-3xl md:text-4xl lg:text-5xl`
- Section heading: `font-serif text-2xl md:text-3xl`
- Card title: `font-serif text-sm @sm:text-base @md:text-lg`
- Eyebrow / label: `text-xs uppercase tracking-[0.35em] text-muted-foreground`

## Spacing and Radii

Base radius: `--radius: 0.75rem` (12px)

| Token | Value | Tailwind |
|-------|-------|---------|
| `--radius-sm` | `0.5rem` (8px) | `rounded-sm` |
| `--radius-md` | `0.625rem` (10px) | `rounded-md` |
| `--radius-lg` | `0.75rem` (12px) | `rounded-lg` |
| `--radius-xl` | `1rem` (16px) | `rounded-xl` |
| `--radius-2xl` | `1.25rem` (20px) | `rounded-2xl` |
| `--radius-3xl` | `1.5rem` (24px) | `rounded-3xl` |

FTT uses generous radii: cards at `rounded-xl` to `rounded-2xl`, buttons at `rounded-full`, input fields at `rounded-2xl`.

## Shadow Tokens

Defined in `tailwind.config.ts` `boxShadow`:

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-soft` | `0 20px 60px -40px rgba(0, 0, 0, 0.45)` | Default card elevation, subtle depth |
| `shadow-lift` | `0 12px 30px -18px rgba(0, 0, 0, 0.6)` | Hover state, focused/active cards |

Transition pattern: `shadow-soft` at rest, `shadow-lift` on `hover:` and `focus-within:`.

## Background Gradients

| Token | Usage |
|-------|-------|
| `bg-luxury-fade` | Hero overlays, dark gradient on images: `linear-gradient(135deg, rgba(15,8,6,0.85), rgba(49,26,19,0.5), rgba(245,240,232,0.15))` |

## Figma Handoff

All tokens in this file should map 1:1 to Figma variables. To export:
1. Copy the `:root` token block from `globals.css` (locate by the `:root {` selector)
2. Import into Figma as color variables with matching names
3. Brand palette (`trunk-*`) maps to a separate Figma collection
4. Typography styles use the same family/weight/size combinations listed above

When designers update tokens in Figma, the corresponding CSS variables in `globals.css` must be updated to match.
