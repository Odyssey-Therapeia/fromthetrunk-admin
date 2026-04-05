# Component Patterns

Reference guide for shadcn/ui v4, Base UI, and component architecture conventions. This is a Tier 2 boilerplate doc — same across all Next.js frontend projects.

If shadcn/skills is installed (`npx skills add shadcn/ui`), it provides live project context from `components.json`. This doc serves as a fallback and covers architecture patterns the skills system does not.

## shadcn v4 CLI Quick Reference

```bash
# Add a component (prompts for overwrite if it already exists)
npx shadcn@latest add button

# Preview changes before applying (safe for live projects)
npx shadcn@latest add button --diff

# Dry-run: show what would be added without writing files
npx shadcn@latest add button --dry-run

# Search the registry for a component by name
npx shadcn@latest search "date"

# View component source without adding
npx shadcn@latest view button

# Check project config (framework, base, installed components)
npx shadcn@latest info

# Initialize in a new project (choose base, preset, framework)
npx shadcn@latest init -t next

# Initialize with a specific preset and base
npx shadcn@latest init -t next --preset [CODE] --base base
```

## Base UI vs Radix

shadcn v4 supports two primitive libraries. Set via `--base` during init or in `components.json`.

| Aspect | Radix (`--base radix`) | Base UI (`--base base`) |
|--------|----------------------|------------------------|
| Maintainer | Radix UI team | MUI / Base UI team |
| Composition | `asChild` prop + `Slot` | `render` prop |
| Form primitives | Custom `Form` + `FormField` | `Field`, `FieldGroup`, `FieldSet` |
| Checkbox `checked` | `boolean \| "indeterminate"` | Strict `boolean` + separate `indeterminate` prop |
| ToggleGroup `value` | `string \| string[]` | Always `string[]` + `multiple` flag |
| Status | Fully supported, stable | Default for new projects in v4 |

### Migration order (Radix -> Base UI)

Migrate component-by-component, not all at once. Recommended sequence:

1. **Atomic components** (Button, Badge, Input) — simplest API changes
2. **Composite components** (Card, Accordion, Dialog) — remove `asChild`, switch to `render`
3. **Form components** — biggest change: `Form`/`FormField` -> `Field`/`FieldGroup`
4. **Regression test** — style and interaction audit across all breakpoints

Use `npx shadcn@latest add <name> --diff` to preview each migration. Radix components keep working alongside Base UI — no big-bang required.

### Key API change: asChild -> render

```tsx
// Radix (old): asChild passes props to child element
<Button asChild>
  <Link href="/about">About</Link>
</Button>

// Base UI (new): render prop is explicit
<Button render={<Link href="/about" />}>About</Button>
```

## Component Extension Pattern

shadcn primitives in `components/ui/` are source code you own, but direct modification creates merge conflicts with future shadcn updates. Instead, extend via wrapping:

```tsx
// components/product/price-badge.tsx
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

interface PriceBadgeProps extends BadgeProps {
  pricePaise: number;
  originalPricePaise?: number;
}

export function PriceBadge({ pricePaise, originalPricePaise, className, ...props }: PriceBadgeProps) {
  return (
    <Badge className={cn("bg-white/85 text-foreground shadow-soft", className)} {...props}>
      {formatCurrency(pricePaise / 100)}
      {originalPricePaise && (
        <span className="ml-1.5 text-muted-foreground line-through">
          {formatCurrency(originalPricePaise / 100)}
        </span>
      )}
    </Badge>
  );
}
```

Principles:
- Accept `className` and spread remaining props — allows caller customization
- Use `cn()` to merge classes — caller's `className` wins over defaults via `tailwind-merge`
- Domain-specific logic (formatting, conditional rendering) lives in the wrapper, not the primitive

## Component Creation Decision Tree

| Need | Action |
|------|--------|
| Standard UI control (button, dialog, card, tooltip) | `npx shadcn@latest add <name>` |
| Project-specific composite (ProductCard, OrderRow) | Create in `components/{domain}/` |
| Shared across multiple projects | Build a custom shadcn registry |
| Page section (hero, feature grid, testimonials) | Create in `components/sections/` |
| Animation wrapper | Create in `components/animations/` |
| Layout shell (header, footer, sidebar) | Create in `components/layout/` |

Never create components inside `app/` route directories. Never rebuild primitives that shadcn provides.

## Form Patterns

### TanStack Form + shadcn Field (Base UI)

```tsx
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { z } from "zod";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export function ContactForm() {
  const form = useForm({
    defaultValues: { email: "", name: "" },
    validatorAdapter: zodValidator(),
    validators: { onChange: schema },
    onSubmit: async ({ value }) => { /* submit logic */ },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <FieldGroup>
        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.length > 0 && (
                <FieldDescription className="text-destructive">
                  {field.state.meta.errors.join(", ")}
                </FieldDescription>
              )}
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <Button type="submit">Submit</Button>
    </form>
  );
}
```

### Radix-based forms (existing projects)

Projects still on Radix use the `Form`/`FormField` pattern from shadcn v3. These continue to work. Migrate to `Field`/`FieldGroup` only when actively reworking the form.

## Import Conventions

```tsx
// shadcn primitives
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Domain composites
import { ProductCard } from "@/components/product/product-card";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";

// Layout shells
import { SiteHeader } from "@/components/layout/site-header";

// Utilities
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
```

Rules:
- `@/components/ui/*` for shadcn primitives only
- `@/components/{domain}/*` for project composites
- `@/lib/*` for shared utilities and helpers
- Never import from relative paths across domain boundaries (e.g., `../../product/card` from inside `cart/`)
- Never import directly from `@radix-ui/*` or `@base-ui/*` — always go through the shadcn wrapper in `components/ui/`
