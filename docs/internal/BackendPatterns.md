# Backend Patterns

Reference guide for hexagonal (ports-and-adapters) architecture using Hono, Drizzle ORM, Zod, and OpenAPI. This is a Tier 2 boilerplate doc — same across all Next.js + Hono backend projects.

## Architecture: Ports and Adapters

The API layer follows hexagonal architecture. Business logic has zero dependency on HTTP frameworks, databases, or UI. External concerns connect through typed interfaces.

```text
HTTP Request
  │
  ▼
┌─────────────────────────────────────────────┐
│  Hono Route (primary adapter)               │  api/hono/routes/*
│  ├── Zod Schema (input/output port)         │  api/hono/schemas/*
│  ├── Auth Middleware (cross-cutting)         │  api/hono/middleware/*
│  │                                          │
│  ▼                                          │
│  Service / Domain Logic (core)              │  lib/*
│  │                                          │
│  ▼                                          │
│  Drizzle Query (secondary adapter)          │  db/queries/*
│  └── Schema (table definitions)             │  db/schema.ts
└─────────────────────────────────────────────┘
  │
  ▼
HTTP Response
```

## Layer Responsibilities

### Routes (`api/hono/routes/`)

HTTP concerns only. Parse request, validate input via Zod, call the appropriate query or service, format the response. Never contain business logic.

Each route module exports a `register*Routes(app)` function that mounts operations on an `OpenAPIHono` sub-app:

```ts
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { listProductsQuerySchema } from "@/api/hono/schemas/products";
import { errorSchema } from "@/api/hono/schemas/common";
import { listProducts } from "@/db/queries/products";
import type { HonoBindings } from "@/api/hono/types";

const listRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: listProductsQuerySchema },
  responses: {
    200: { description: "Product list" },
    500: { content: { "application/json": { schema: errorSchema } }, description: "Server error" },
  },
});

export function registerProductRoutes(app: OpenAPIHono<HonoBindings>) {
  app.openapi(listRoute, async (c) => {
    const query = c.req.valid("query");
    const result = await listProducts(query);
    return c.json(result);
  });
}
```

The root app in `api/hono/app.ts` composes all sub-apps:

```ts
const productsApp = new OpenAPIHono<HonoBindings>();
registerProductRoutes(productsApp);
app.route("/products", productsApp);
```

### Schemas (`api/hono/schemas/`)

Zod schemas for request validation and OpenAPI spec generation. One file per domain, plus `common.ts` for shared schemas (`errorSchema`, `idParamSchema`, `slugParamSchema`).

```ts
import { z } from "zod";

export const listProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(12),
  page: z.coerce.number().int().min(1).default(1),
  collection: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
});
```

Schemas registered with `createRoute()` automatically appear in the generated OpenAPI spec at `/api/v2/openapi.json` and Swagger UI at `/api/v2/docs`.

### Queries (`db/queries/`)

Drizzle ORM operations. Typed with `InferSelectModel` / `InferInsertModel` from `drizzle-orm`. Return domain types, not raw database rows.

```ts
import { eq } from "drizzle-orm";
import { InferSelectModel } from "drizzle-orm";
import { db } from "@/db";
import { products, productImages, mediaAssets, tags } from "@/db/schema";

type ProductRecord = InferSelectModel<typeof products>;

export type ProductWithRelations = ProductRecord & {
  images: Array<{ media: InferSelectModel<typeof mediaAssets>; sortOrder: number }>;
  tags: InferSelectModel<typeof tags>[];
};

export async function getProductBySlug(slug: string): Promise<ProductWithRelations | null> {
  // Drizzle query with relations
}
```

Patterns:
- One query module per domain (products, collections, orders, users, etc.)
- Import `db` from `@/db` — never instantiate database connections in query files
- Use options objects for flexible filtering: `listProducts({ limit, page, collection, status })`
- Return typed domain objects, not raw `SelectResult` — callers should not know about table structure

### Services (`lib/`)

Business logic, orchestration, and side effects (email via Resend, payments via Razorpay, AI via embeddings/recommendations). Services call query modules, never access `db` directly.

```ts
// lib/ai/recommendations.ts
import { listProducts } from "@/db/queries/products";
import { getProductEmbedding } from "@/lib/ai/embeddings";

export async function recommendProducts(productId: string, limit: number) {
  const embedding = await getProductEmbedding(productId);
  const candidates = await listProducts({ limit: limit * 3 });
  // Business logic: score, rank, filter
  return ranked.slice(0, limit);
}
```

### Middleware (`api/hono/middleware/`)

Cross-cutting concerns. Currently: `auth.ts` for session resolution and role-based access control.

- `authMiddleware` — resolves session from request cookies, attaches user context to Hono `c.var`
- `requireAdmin` — guards admin-only routes, returns 403 if user is not admin

## Schema Definition (`db/schema.ts`)

Single source of truth for the database structure. Uses `drizzle-orm/pg-core` with Neon serverless driver.

```ts
import { pgTable, pgEnum, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const stockStatusEnum = pgEnum("stock_status", ["available", "reserved", "sold"]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  pricePaise: integer("price_paise").notNull(),
  stockStatus: stockStatusEnum("stock_status").default("available").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Migrations via Drizzle Kit:

```bash
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate    # Apply migrations to the database
npx drizzle-kit studio     # Visual database browser
```

## Error Handling

Standardized error shape via `errorSchema` in `api/hono/schemas/common.ts`:

```ts
export const errorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});
```

Routes return errors with appropriate HTTP status codes. The OpenAPI spec documents error responses for every route.

## OpenAPI Integration

Every route uses `createRoute()` with typed Zod schemas. This auto-generates:
- **OpenAPI JSON spec** at `/api/v2/openapi.json`
- **Swagger UI** at `/api/v2/docs`

Client code and tests can be generated from the spec. Frontend data fetching can use the typed schemas for end-to-end type safety.

## Anti-patterns

- Raw SQL in route handlers — use Drizzle query builders in `db/queries/`
- Business logic in routes — extract to `lib/` services
- Direct `db` imports in route files — call query modules instead
- Untyped request bodies — always validate with Zod schemas
- Hardcoded auth checks — use `requireAdmin` middleware
- Missing error responses in `createRoute()` — document all failure modes

---

## GSAP in React 19

Animation patterns for GSAP 3.14+ with React 19. Included here as a cross-cutting concern rather than a separate doc.

### Setup

```ts
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);
```

Register plugins at module level, outside any component.

### useGSAP hook

Drop-in replacement for `useEffect` / `useLayoutEffect` that automatically handles cleanup via `gsap.context()`. Prevents duplicate animations in React Strict Mode.

```tsx
function AnimatedSection({ children }: { children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".reveal", {
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger: 0.1,
      scrollTrigger: { trigger: container.current, start: "top 80%" },
    });
  }, { scope: container });

  return <div ref={container}>{children}</div>;
}
```

Key points:
- `scope` limits selector text (`.reveal`) to the container subtree — avoids cross-component conflicts
- Cleanup runs automatically on unmount — no manual `ScrollTrigger.kill()` needed
- For dependency-driven re-animation, pass `{ dependencies: [dep], revertOnUpdate: true }`
- Apply `transform-gpu` (Tailwind class) on animated elements for hardware acceleration
- Always check `prefers-reduced-motion` and provide a static fallback
