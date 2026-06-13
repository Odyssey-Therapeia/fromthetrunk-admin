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
| `npm run lhci` | Build, start the production server, and run Lighthouse CI against the default storefront URL set |
| `npm run lhci:mobile` | Run Lighthouse CI with mobile Lighthouse settings |
| `npm run lhci:desktop` | Run Lighthouse CI with desktop Lighthouse settings |
| `npm run lhci:admin:mobile` | Run authenticated Lighthouse CI against admin pages with mobile settings |
| `npm run lhci:admin:desktop` | Run authenticated Lighthouse CI against admin pages with desktop settings |
| `npm run verify` | Run unit tests, lint, and production build |
| `npm run verify:ux` | Run the production build plus public and authenticated-admin Lighthouse CI (mobile + desktop) |
| `npm run agent:check` | Required full agent gate for UI work: tests, lint, build, and Lighthouse CI |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run demo:check` | Demo readiness checks |
| `npm run generate:icons` | Generate app icons |
| `npm run migrate:payload-to-drizzle` | Import legacy data into current Drizzle schema |

Lighthouse CI can be steered with environment variables:

```bash
FTT_LHCI_URL_PATHS="/,/collection,/cart,/checkout" npm run lhci
FTT_LHCI_FORM_FACTOR=desktop FTT_LHCI_URL_PATHS="/,/privacy-policy" npm run lhci
FTT_LHCI_SCOPE=admin FTT_LHCI_AUTH_EMAIL="admin@example.com" FTT_LHCI_AUTH_PASSWORD="..." npm run lhci:autorun
```

The GitHub Actions job runs the static policy/packing pages by default so CI does not require a live product database. Local `npm run lhci` audits the broader storefront route set.

Authenticated admin audits require `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXTAUTH_SECRET`, `FTT_LHCI_AUTH_EMAIL`, and `FTT_LHCI_AUTH_PASSWORD`. Store those as local shell secrets or GitHub Actions secrets; never commit them. In GitHub Actions, the authenticated admin job exits cleanly with a notice when those secrets are not configured. Admin Lighthouse reports are only uploaded when `FTT_LHCI_SANITIZED_DB=true` is configured, so order/customer HTML reports are not artifacted from a live database by default.

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
