# From the Trunk

> Curated collection of authenticated, pre-loved luxury sarees with provenance.

A full-stack e-commerce platform built with **Next.js 16**, **Payload CMS 3**, **PostgreSQL**, and **Razorpay**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router with Promise-based params, Turbopack) |
| CMS | Payload CMS 3.75 (PostgreSQL adapter) |
| Database | PostgreSQL (Neon/Supabase compatible, with connection pooling) |
| Auth | NextAuth v4 (Google, Azure AD, Twitter OAuth) |
| Payments | Razorpay (INR, test + live modes) |
| Email | Resend (transactional + newsletter) |
| Styling | Tailwind CSS v4, Radix UI, Framer Motion, GSAP |
| State | Zustand (cart), React Query (server data) |
| Testing | Vitest (68 tests across 17 files) |
| CI/CD | GitHub Actions (lint → test → build) |

## Features

### E-Commerce
- **Razorpay payments** — full checkout flow with server-side pricing
- **GST calculation** (12%) + shipping tiers (standard/express/free above ₹25K)
- **One-of-a-kind inventory** — products are unique, stockStatus tracks available/reserved/sold
- **Cart reservation** — 30-minute server-side hold with automatic expiry (cron)
- **Order lifecycle** — pending → confirmed → shipped → delivered with email at each step

### Customer Features
- **Wishlist** with heart icon (optimistic UI) and dedicated account page
- **Recently viewed** products tracked in localStorage
- **Search** with live dropdown + full results page
- **Saved address pre-fill** at checkout
- **Order detail** page with status timeline

### Content Management
- **Payload CMS admin** with custom branded dashboard
- **CMS-editable** homepage, collection page, our story, how it works
- **Draft preview** and live preview for all content
- **Media management** with thumbnail + card image sizes

### Communication
- **Order confirmation** email (auto-sent after payment)
- **Shipping notification** email (admin-triggered with tracking number)
- **Welcome email** on first sign-up
- **Newsletter** with double opt-in

### Infrastructure
- **SEO** — per-page metadata, Open Graph, sitemap, robots.txt, Product JSON-LD
- **Security** — HSTS, CSP headers, rate limiting on sensitive routes, webhook signature verification
- **Accessibility** — skip nav, aria-live cart announcements, keyboard navigation
- **Dark mode** — system preference detection with manual toggle
- **Error handling** — branded 404, error boundary, loading skeletons for every page

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or Neon/Supabase)
- OAuth provider credentials (at least one)

### Setup

```bash
# Clone and install
git clone https://github.com/Odyssey-Therapeia/FTT-fromthetrunk.git
cd FTT-fromthetrunk
npm install --legacy-peer-deps

# Configure environment
cp .env.example .env.local
# Edit .env.local with your database URL, secrets, and OAuth credentials

# Run database migrations
npm run payload:migrate

# Seed sample products
npm run seed:payload

# Start development server
npm run dev
```

### Environment Variables

See [`.env.example`](.env.example) for development and [`.env.production.example`](.env.production.example) for production. Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PAYLOAD_SECRET` | Payload CMS encryption secret |
| `NEXTAUTH_SECRET` | NextAuth session encryption |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay payments |
| `RESEND_API_KEY` | Transactional emails |
| `CRON_SECRET` | Cron endpoint authentication |
| `ADMIN_API_SECRET` | Admin API authentication |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest test suite |
| `npm run payload:types` | Generate Payload TypeScript types |
| `npm run payload:migrate` | Run database migrations |
| `npm run payload:migrate:create` | Create new migration |
| `npm run seed:payload` | Seed sample products |

## Project Structure

```
app/
├── (site)/              # Customer-facing pages
│   ├── page.tsx         # Homepage
│   ├── collection/      # Product listing + detail
│   ├── cart/            # Shopping bag
│   ├── checkout/        # Payment flow + confirmation
│   ├── search/          # Search results
│   ├── account/         # Profile, addresses, orders, wishlist
│   └── ...policy/       # Legal pages
├── (payload)/           # Payload CMS admin
└── api/                 # API routes
    ├── account/         # Profile, addresses, orders, wishlist
    ├── payments/        # Razorpay create-order + verify
    ├── webhooks/        # Razorpay webhook handler
    ├── cart/            # Reserve + release
    ├── newsletter/      # Subscribe + confirm
    ├── search/          # Product search
    ├── admin/           # Admin order status updates
    └── cron/            # Reservation cleanup
components/
├── cart/                # Cart drawer, item, add-to-cart button
├── checkout/            # Checkout form
├── layout/              # Header, footer, search bar, theme toggle
├── product/             # Product card, gallery, wishlist button, recently viewed
├── sections/            # Homepage sections
├── account/             # Account shell
├── admin/               # Admin dashboard, logo, icon
├── animations/          # Scroll reveal
└── ui/                  # shadcn/ui primitives
lib/
├── auth/                # NextAuth config + Payload adapter
├── data/                # Payload query functions
├── email/               # Resend client + email templates
├── http/                # Error response + rate limiting
├── media/               # Media URL resolver + S3 config
├── payments/            # Razorpay client + calculations
├── seo/                 # JSON-LD structured data
├── store/               # Zustand cart + recently viewed
└── validation/          # Zod schemas
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — System architecture, routing, and data models
- [`docs/manual-acceptance-checklist.md`](docs/manual-acceptance-checklist.md) — 52-item QA checklist
- [`docs/migration-guide.md`](docs/migration-guide.md) — Database schema changes
- [`docs/payload-setup.md`](docs/payload-setup.md) — CMS setup and seeding

## Testing

```bash
npm test              # Run all 68 tests
npm run test:watch    # Watch mode
```

Tests cover: validation schemas, cart store logic, payment calculations, rate limiting, recently viewed, formatters, media URL resolution, and integration tests for all API routes (profile, addresses, orders, payments, search, wishlist, cart, newsletter, admin).

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set all environment variables from `.env.production.example`
3. Deploy — Vercel auto-detects Next.js and runs the build
4. Enable Vercel Cron for `/api/cron/release-reservations` (every 10 min)

### Docker

A `Dockerfile` can be added for self-hosted deployments. The app requires:
- Node.js 20+ runtime
- PostgreSQL database access
- Environment variables configured

## License

ISC
