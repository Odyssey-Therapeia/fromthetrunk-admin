# FTT Design-System Token Contract

**Version:** P2-10 (2026-06-13)
**Audience:** P3+ UI packets. This document is the single source of truth for which tokens, fonts, and components are available. Cite this doc — do not invent tokens.

---

## 1. Color Tokens

All semantic colors are declared in `app/globals.css` as CSS custom properties on `:root` and then surfaced into Tailwind v4's `@theme inline` block as `--color-*` aliases. The values below are what the codebase defines on 2026-06-13.

### 1.1 Semantic color variables (`:root`)

| CSS variable | Raw value | Intended role |
|---|---|---|
| `--background` | `#f5f0e8` | Page background (warm cream) |
| `--foreground` | `#2e2017` | Default body text |
| `--card` | `#faf6f0` | Card surface |
| `--card-foreground` | `#2e2017` | Text on cards |
| `--popover` | `#faf6f0` | Popover surface |
| `--popover-foreground` | `#2e2017` | Text in popovers |
| `--primary` | `#6b1d1d` | Brand burgundy — primary actions |
| `--primary-foreground` | `#f9f5ed` | Text on primary surfaces |
| `--secondary` | `#e9e0d2` | Secondary surfaces |
| `--secondary-foreground` | `#2e2017` | Text on secondary |
| `--muted` | `#efe6d8` | De-emphasised surfaces |
| `--muted-foreground` | `#6d5a4e` | De-emphasised text |
| `--accent` | `#b8860b` | Brand gold — highlights, links |
| `--accent-foreground` | `#fdf8ea` | Text on accent surfaces |
| `--destructive` | `#b42318` | Error / danger actions |
| `--destructive-foreground` | `#ffffff` | Text on destructive |
| `--border` | `#dccbb7` | Border / divider |
| `--input` | `#dccbb7` | Input border |
| `--ring` | `#6b1d1d` | Focus ring |
| `--chart-1` | `#6b1d1d` | Chart series 1 |
| `--chart-2` | `#b8860b` | Chart series 2 |
| `--chart-3` | `#3d2b1f` | Chart series 3 |
| `--chart-4` | `#d7bfa6` | Chart series 4 |
| `--chart-5` | `#7b5a45` | Chart series 5 |
| `--sidebar` | `#f6f1ea` | Admin sidebar background |
| `--sidebar-foreground` | `#2e2017` | Admin sidebar text |
| `--sidebar-primary` | `#6b1d1d` | Admin sidebar active item |
| `--sidebar-primary-foreground` | `#f9f5ed` | Text on sidebar primary |
| `--sidebar-accent` | `#e9e0d2` | Admin sidebar hover |
| `--sidebar-accent-foreground` | `#2e2017` | Text on sidebar accent |
| `--sidebar-border` | `#dccbb7` | Admin sidebar border |
| `--sidebar-ring` | `#6b1d1d` | Admin sidebar focus ring |

### 1.2 Tailwind `@theme inline` color aliases

The block in `app/globals.css` maps every semantic variable above into Tailwind utility classes via `--color-*` names. In className strings, use the semantic utility name (e.g. `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`). The underlying `--color-*` CSS variables are:

```
--color-background      --color-foreground
--color-card            --color-card-foreground
--color-popover         --color-popover-foreground
--color-primary         --color-primary-foreground
--color-secondary       --color-secondary-foreground
--color-muted           --color-muted-foreground
--color-accent          --color-accent-foreground
--color-destructive
--color-border          --color-input          --color-ring
--color-chart-1  ..  --color-chart-5
--color-sidebar         --color-sidebar-foreground
--color-sidebar-primary --color-sidebar-primary-foreground
--color-sidebar-accent  --color-sidebar-accent-foreground
--color-sidebar-border  --color-sidebar-ring
```

### 1.3 Brand palette (tailwind.config.ts static aliases)

The config adds a `trunk` key for use as `text-trunk-*` / `bg-trunk-*`. These are direct hex aliases for the core brand palette — use them only for decorative overlays or illustration elements where a semantic alias does not exist:

| Utility class | Value |
|---|---|
| `trunk-burgundy` | `#6B1D1D` |
| `trunk-gold` | `#B8860B` |
| `trunk-cream` | `#F5F0E8` |
| `trunk-brown` | `#3D2B1F` |

Note: the semantic tokens (`--primary`, `--accent`, `--background`) are preferred over these static aliases in component code.

---

## 2. Radius Tokens

Base radius is `--radius: 0.75rem` (12 px). Derived scale is registered in `@theme inline`:

| Tailwind class suffix | CSS variable | Computed value |
|---|---|---|
| `rounded-sm` | `--radius-sm` | `calc(0.75rem - 4px)` = 8 px |
| `rounded-md` | `--radius-md` | `calc(0.75rem - 2px)` = 10 px |
| `rounded-lg` | `--radius-lg` | `0.75rem` = 12 px |
| `rounded-xl` | `--radius-xl` | `calc(0.75rem + 4px)` = 16 px |
| `rounded-2xl` | `--radius-2xl` | `calc(0.75rem + 8px)` = 20 px |
| `rounded-3xl` | `--radius-3xl` | `calc(0.75rem + 12px)` = 24 px |
| `rounded-4xl` | `--radius-4xl` | `calc(0.75rem + 16px)` = 28 px |

Use these utility classes — never hardcode `px` values in `rounded-[…]` arbitrary notation.

---

## 3. Spacing Scale

The project uses Tailwind v4's default spacing scale (the 0.25 rem / 4 px grid). No custom spacing overrides exist in `tailwind.config.ts`. The standard scale applies: `p-1` = 4 px, `p-2` = 8 px, `p-4` = 16 px, `p-6` = 24 px, `p-8` = 32 px, etc.

---

## 4. Shadow Tokens

Defined in `tailwind.config.ts` `theme.extend.boxShadow`:

| Utility class | Value |
|---|---|
| `shadow-soft` | `0 20px 60px -40px rgba(0,0,0,0.45)` |
| `shadow-lift` | `0 12px 30px -18px rgba(0,0,0,0.6)` |

Standard Tailwind shadows (`shadow`, `shadow-sm`, `shadow-md`, `shadow-lg`) are also available.

---

## 5. Background Image Tokens

| Utility class | Description |
|---|---|
| `bg-luxury-fade` | `linear-gradient(135deg, rgba(15,8,6,0.85), rgba(49,26,19,0.5), rgba(245,240,232,0.15))` — dark luxury overlay for hero images |

---

## 6. Typography — Fonts

### 6.1 Font variables

Fonts are loaded via `next/font/google` and injected as CSS variables on the `<html>` element in both site and admin layouts.

| CSS variable | Font | Weights loaded | Layout where applied |
|---|---|---|---|
| `--font-sans` | Inter | default (variable) | site + admin |
| `--font-serif` | Cormorant Garamond | 400, 500, 600, 700 | site only |

### 6.2 Tailwind font family utilities

`tailwind.config.ts` maps these into Tailwind's `fontFamily` extension:

```
font-sans  →  var(--font-sans), ui-sans-serif, system-ui, sans-serif
font-serif →  var(--font-serif), ui-serif, Georgia, serif
```

The `body` uses `font-sans` by default (set in `@layer base`).

### 6.3 Type scale

Tailwind v4 default type scale applies. Commonly used steps in this codebase:

| Utility | Size |
|---|---|
| `text-xs` | 0.75 rem (12 px) |
| `text-sm` | 0.875 rem (14 px) |
| `text-base` | 1 rem (16 px) |
| `text-lg` | 1.125 rem (18 px) |
| `text-xl` | 1.25 rem (20 px) |
| `text-2xl` | 1.5 rem (24 px) |
| `text-3xl` | 1.875 rem (30 px) |
| `text-4xl` | 2.25 rem (36 px) |

No custom font-size overrides exist in `tailwind.config.ts`.

---

## 7. Component Inventory — `components/ui/`

All 21 files are shadcn/ui components skinned to the token contract above. They are the permitted building blocks for UI packets.

| File | Exports | Notes |
|---|---|---|
| `accordion.tsx` | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` | Radix Accordion |
| `avatar.tsx` | `Avatar`, `AvatarImage`, `AvatarFallback` | Radix Avatar |
| `badge.tsx` | `Badge`, `badgeVariants` | Variants: `default`, `secondary`, `destructive`, `outline` |
| `bento-grid.tsx` | `BentoGrid`, `BentoCard` | Custom layout grid component; uses `shadow-soft`, `shadow-lift`, `trunk-gold` |
| `button.tsx` | `Button`, `buttonVariants` | Variants: `default`, `heroSecondary`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes: `default`, `sm`, `lg`, `icon` |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | |
| `dialog.tsx` | `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` | Radix Dialog |
| `dropdown-menu.tsx` | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuGroup`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuCheckboxItem` | Radix DropdownMenu |
| `input.tsx` | `Input` | Single-line text input |
| `label.tsx` | `Label` | Radix Label |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor` | Radix Popover |
| `progress.tsx` | `Progress` | Radix Progress |
| `select.tsx` | `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` | Radix Select |
| `separator.tsx` | `Separator` | Radix Separator |
| `sheet.tsx` | `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription` | Radix Dialog (side panel) |
| `skeleton.tsx` | `Skeleton` | Loading placeholder |
| `switch.tsx` | `Switch` | Radix Switch |
| `table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` | |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Radix Tabs |
| `textarea.tsx` | `Textarea` | Multi-line text input |
| `tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | Radix Tooltip |

---

## 8. Drift Rules for P3+ UI Packets

These rules are enforced by mechanical grep checks. A packet fails review if any violation is found in the files it touches.

### Rule 1 — No raw hex colours in className or JSX

**Rationale:** Hardcoded hex values bypass the semantic token system and break future theme changes.

**Allowed:** Tailwind semantic utilities (`bg-primary`, `text-muted-foreground`, `bg-trunk-gold`, etc.) or CSS variable references (`var(--primary)`).

**Banned:** Any raw hex literal in JSX className strings or inline `style` objects.

**Verifier grep (run from repo root):**
```
grep -rn '#[0-9a-fA-F]\{3,6\}' app/ components/ --include='*.tsx' --include='*.ts'
```

Expected result: zero matches in files touched by the packet. (Existing violations in files the packet does not touch are pre-existing and out of scope.)

### Rule 2 — No arbitrary px values in Tailwind className strings

**Rationale:** Arbitrary `[…px]` values circumvent the spacing and sizing scales defined in the token contract.

**Allowed:** Named Tailwind utilities (`p-4`, `w-8`, `h-10`, `rounded-lg`, etc.) or CSS variable–based arbitrary values (`w-[var(--sidebar-width)]`).

**Banned:** Any arbitrary numeric `px` value in a className attribute (e.g. `w-[120px]`, `p-[18px]`, `mt-[5px]`).

**Verifier grep (run from repo root):**
```
grep -rn '\b[0-9]\+px\b' app/ components/ --include='*.tsx' --include='*.ts'
```

Expected result: zero matches in files touched by the packet.

### Rule 3 — No new font families

**Rationale:** Only `--font-sans` (Inter) and `--font-serif` (Cormorant Garamond) are loaded. Adding a new font requires a layout change, a font-variable registration, and a tailwind config update — it is a separate packet-level decision.

**Banned:** Any new `font-*` import from `next/font/google`, any `@font-face`, any new `font-family` CSS property, any new `fontFamily` entry in `tailwind.config.ts`.

**Verifier check (manual):** `grep -rn 'next/font' app/ --include='*.tsx'` must return exactly two files: `app/(site)/layout.tsx` and `app/(admin)/layout.tsx`. No new entries.

### Rule 4 — Use `components/ui/` components before writing custom markup

If a needed UI primitive exists in `components/ui/`, use it. Do not re-implement buttons, inputs, cards, dialogs, tabs, selects, etc. from scratch.

---

## 9. Self-Review Checklist

- [x] All color variable names are quoted verbatim from `app/globals.css` — no invented tokens.
- [x] Both `@theme inline` aliases and the `:root` raw variables are documented.
- [x] The `trunk-*` tailwind palette is documented with a clear note that semantic tokens are preferred.
- [x] Radius scale derived values are computed and shown explicitly.
- [x] Spacing scale is documented as the Tailwind v4 default (no overrides).
- [x] Both shadow tokens are listed.
- [x] Both font variables (`--font-sans`, `--font-serif`) are named with their typefaces, weights, and layout scope.
- [x] All 21 `components/ui/` files are listed with their exports.
- [x] `bento-grid.tsx` is flagged as a custom component (not a standard shadcn primitive).
- [x] Drift rules include the exact grep commands a verifier can copy-paste.
- [x] The two mechanical checks (raw hex, arbitrary px) cover the patterns stated in the task spec.
- [x] No code was modified — doc only.
