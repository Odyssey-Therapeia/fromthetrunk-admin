# From the Trunk - Architecture Overview

This document describes the current architecture after the custom admin + Hono/Drizzle migration.

## 1) Application Routing

### `(site)` route group
Customer-facing storefront:
- `/`
- `/collection`, `/collection/[slug]`
- `/cart`, `/checkout`, `/checkout/confirmation`
- `/search`
- `/account/*` (profile, addresses, orders, wishlist)

### `(admin)` route group
Custom admin workspace:
- `/admin`
- `/admin/products`
- `/admin/collections`
- `/admin/orders`
- `/admin/customers`
- `/admin/media`
- `/admin/globals`
- `/admin/settings`

Access is guarded server-side in `app/(admin)/layout.tsx` using session role checks.

### API routing
- `app/api/v2/[...route]/route.ts` mounts the Hono app.
- `app/api/auth/[...nextauth]/route.ts` handles NextAuth.

## 2) API Layer (Hono v2)

`api/hono/app.ts` composes:
- `OpenAPIHono` app
- global CORS + auth middleware
- route modules
- OpenAPI spec generation
- Swagger UI

Available docs:
- OpenAPI JSON: `/api/v2/openapi.json`
- Swagger UI: `/api/v2/docs`

Route modules are grouped in `api/hono/routes/` (products, collections, orders, users, addresses, wishlist, media, newsletter, search, globals, payments, webhooks, cron, admin-orders, cart).

## 3) Data Layer (Drizzle + PostgreSQL)

- Schema source: `db/schema.ts`
- Query layer: `db/queries/*`
- App/business logic consumes query modules directly.

Key entities:
- users, auth sessions/accounts/tokens
- addresses
- media_assets
- collections
- products + product_images + tags + product_tags
- orders + order_items + order_events
- wishlist_items
- newsletter_subscribers
- site_config (global content/settings)

## 4) Auth

- NextAuth with custom Drizzle adapter (`lib/auth/drizzle-adapter.ts`)
- Providers: Google, Azure AD, Twitter (optional), Credentials
- Hono middleware resolves auth context and enforces admin/customer access controls.

## 5) Media and Uploads

- Vercel Blob direct upload flow
- Hono endpoints:
  - `POST /api/v2/media/upload`
  - `POST /api/v2/media/complete`

## 6) Commerce runtime

- Canonical pricing computed server-side during order/payment creation
- Shipping + GST handled in backend helpers
- Product inventory lifecycle:
  - available -> reserved -> sold
- Reservation cleanup cron:
  - `GET /api/v2/cron/release-reservations`

## 7) Realtime

Admin order/product views can consume ElectricSQL shape feeds through the client helpers in `lib/realtime`.
