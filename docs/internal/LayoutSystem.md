# Layout System

Reference guide for responsive layout patterns using Tailwind CSS v4 container queries and viewport media queries. This is a Tier 2 boilerplate doc — same across all Next.js frontend projects.

## Two-Tier Responsive Strategy

**Page-level (macro)** — viewport media queries for structural decisions:

```tsx
{/* Grid column count changes based on viewport */}
<div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
  <ProductCard />
</div>

{/* Page padding scales with viewport */}
<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
  {children}
</div>
```

**Component-level (micro)** — container queries for internal layout:

```tsx
{/* Card adapts to its container width, not the viewport */}
<div className="@container">
  <div className="p-3 @sm:p-4 @md:p-5">
    <h3 className="text-sm @sm:text-base @md:text-lg font-serif">…</h3>
    <p className="text-xs @sm:text-sm text-muted-foreground">…</p>
  </div>
</div>
```

The component does not know or care whether it's in a 2-column mobile grid, a 3-column desktop grid, a sidebar, or a modal. It responds to the space it's given.

## Container Query Reference — Tailwind v4

Built-in (no plugin required). Add `@container` to the parent, use `@`-prefixed variants on children.

### Breakpoints

| Variant | Container width |
|---------|----------------|
| `@xs`   | 20rem (320px)  |
| `@sm`   | 24rem (384px)  |
| `@md`   | 28rem (448px)  |
| `@lg`   | 32rem (512px)  |
| `@xl`   | 36rem (576px)  |
| `@2xl`  | 42rem (672px)  |
| `@3xl`  | 48rem (768px)  |
| `@4xl`  | 56rem (896px)  |
| `@5xl`  | 64rem (1024px) |
| `@6xl`  | 72rem (1152px) |
| `@7xl`  | 80rem (1280px) |

### Advanced syntax

```tsx
{/* Max-width queries — styles apply BELOW the threshold */}
<div className="flex flex-row @max-md:flex-col">

{/* Range queries — target a specific band */}
<div className="@sm:@max-md:bg-muted">

{/* Named containers — disambiguate nested containers */}
<div className="@container/sidebar">
  <div className="@sm/sidebar:grid-cols-2">

{/* Arbitrary values */}
<div className="@[400px]:flex-row">
```

### Container query units

For fluid typography and spacing that scales with the container:

```css
.card-title {
  font-size: clamp(0.875rem, 4cqw, 1.25rem);
}
```

| Unit    | Meaning                        |
|---------|--------------------------------|
| `cqw`   | 1% of container width          |
| `cqh`   | 1% of container height         |
| `cqi`   | 1% of container inline size    |
| `cqb`   | 1% of container block size     |
| `cqmin` | Smaller of `cqi` and `cqb`     |
| `cqmax` | Larger of `cqi` and `cqb`      |

## Grid Patterns

### E-commerce card grid

Two columns on mobile, three on desktop. Cards use container queries internally.

```tsx
{/* Page-level: viewport queries for column count */}
<div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-3">
  {products.map((product) => (
    {/* Component-level: container queries for card internals */}
    <div className="@container" key={product.id}>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="relative aspect-[3/4] @sm:aspect-[4/5]">
          <Image src={product.image} alt={product.name} fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover" />
        </div>
        <div className="space-y-1 p-3 @sm:space-y-1.5 @sm:p-4">
          <h3 className="truncate text-sm font-medium @sm:text-base">
            {product.name}
          </h3>
          <p className="text-xs text-muted-foreground @sm:text-sm">
            {product.price}
          </p>
        </div>
      </div>
    </div>
  ))}
</div>
```

### Dashboard widget grid

Named containers let widgets adapt independently even when nested.

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
  <div className="@container/widget md:col-span-2">
    <div className="rounded-xl border bg-card p-4 @md/widget:p-6">
      <h3 className="text-base @md/widget:text-lg font-semibold">Revenue</h3>
      {/* Chart switches from compact to full at container md */}
      <div className="h-48 @md/widget:h-72">{chart}</div>
    </div>
  </div>
</div>
```

### Content + sidebar

Stacked on mobile, side-by-side on desktop. Sidebar content adapts via container queries.

```tsx
<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
  <main>{content}</main>
  <aside className="@container">
    <div className="space-y-4 @sm:space-y-6">
      {/* Sidebar widgets adapt to their container, not the viewport */}
    </div>
  </aside>
</div>
```

## Image Responsive Patterns

Always pair `next/image fill` with a `sizes` prop. The browser uses `sizes` to pick the right source from the `srcset`.

| Context | `sizes` value | Why |
|---------|--------------|-----|
| 2-col mobile / 3-col desktop grid | `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw` | Matches typical grid breakpoints |
| Hero / full-bleed | `100vw` | Image spans entire viewport |
| Thumbnail strip | `(max-width: 640px) 25vw, 80px` | Small fixed size on desktop |
| Sidebar card | `(max-width: 1024px) 100vw, 320px` | Full width until sidebar appears |

Aspect ratio with container-query override:

```tsx
<div className="relative aspect-[3/4] @sm:aspect-[4/5] overflow-hidden">
  <Image src={src} alt={alt} fill sizes="..." className="object-cover" />
</div>
```

The shorter 3:4 ratio on small containers keeps cards compact when in a 2-column mobile grid. The taller 4:5 ratio engages when the container is wider.

## Page Scaffold

Standard page wrapper with mobile-appropriate spacing:

```tsx
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:space-y-12 sm:px-6 sm:py-12 lg:py-16">
      <section>{/* hero or header */}</section>
      <section>{/* main content grid */}</section>
      <section>{/* related / footer content */}</section>
    </div>
  );
}
```

Key principles:
- `px-4` base (16px), `sm:px-6` (24px) — never start at `px-6` which eats too much on a 390px phone
- `py-8` base (32px), scale up — never start at `py-16` which wastes a full screen of space on mobile
- `space-y-8` between sections base, scale up — keeps content dense on small screens
- `max-w-6xl` (1152px) constrains content width on ultrawide displays
