# From the Trunk

Curated collection of authenticated, pre-loved luxury sarees with provenance.

This is a full-stack e-commerce platform built with **Next.js 16**, **Hono API v2**, **Drizzle ORM**, **PostgreSQL**, and **Razorpay**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| API | Hono + OpenAPI (`/api/v2/*`) |
| Database | PostgreSQL + Drizzle ORM |
| Auth | NextAuth v4 (Google, Azure AD, Twitter, Credentials) |
| Payments | Razorpay |
| Email | Resend |
| Storage | Vercel Blob |
| UI | Tailwind CSS + Radix + shadcn/ui |
| State | TanStack Query + Zustand |
| Testing | Vitest |

---

## Highlights

- Custom admin workspace at `/admin` (products, collections, orders, customers, media, globals, settings)
- Hono API v2 mounted at `/api/v2`
- OpenAPI spec at `/api/v2/openapi.json` and Swagger UI at `/api/v2/docs`
- Server-side checkout pricing with shipping tiers + GST
- One-of-a-kind inventory with reservation lifecycle (`available` / `reserved` / `sold`)
- Drizzle-based auth adapter for NextAuth
- Realtime admin tables via ElectricSQL shape feeds (fallback polling supported)

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Setup

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

If you need to migrate legacy data into the rebuild schema:

```bash
npm run migrate:payload-to-drizzle
```

---

## Environment Variables

See:
- [`.env.example`](.env.example)
- [`.env.production.example`](.env.production.example)

Core variables include:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- OAuth client keys
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `ADMIN_API_SECRET`

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run demo:check` | Demo readiness checks |
| `npm run generate:icons` | Generate app icons |
| `npm run migrate:payload-to-drizzle` | Import legacy data into current Drizzle schema |

---

## Project Structure

```txt
app/
├── (site)/                 # Storefront routes
├── (admin)/                # Custom admin UI
└── api/
    ├── auth/[...nextauth]  # NextAuth handlers
    └── v2/[...route]       # Hono API adapter

api/hono/
├── app.ts                  # OpenAPIHono app composition
├── middleware/             # auth middleware
├── routes/                 # Route modules
└── schemas/                # zod-openapi schemas

db/
├── schema.ts               # Drizzle table schema
└── queries/                # Data access/query layer

lib/
├── auth/                   # NextAuth options + Drizzle adapter
├── media/                  # Blob upload + media URL resolving
├── payments/               # Razorpay helpers + pricing
└── realtime/               # ElectricSQL shape helpers
```

---

## Deployment

### Vercel

1. Configure all production environment variables
2. Deploy
3. Enable Vercel Cron for:
   - `/api/v2/cron/release-reservations` every 10 minutes

---

## Docs

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/manual-acceptance-checklist.md`](docs/manual-acceptance-checklist.md)
- [`docs/migration-guide.md`](docs/migration-guide.md)
- [`docs/rebuild-data-migration.md`](docs/rebuild-data-migration.md)
- [`docs/cxo-demo-runbook.md`](docs/cxo-demo-runbook.md)
