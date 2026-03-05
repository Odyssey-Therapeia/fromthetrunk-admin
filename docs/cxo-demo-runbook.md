# CXO Demo Runbook

Use this runbook before a stakeholder demo.

## 1) Pre-demo setup

```bash
npm run generate:icons
npm run demo:check
```

If validating migration/imported environments, also run:

```bash
npm run migrate:payload-to-drizzle
npm run demo:check
```

## 2) Environment variables to confirm

- `DATABASE_URL`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- OAuth keys (at least one provider)
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `CRON_SECRET`
- `ADMIN_API_SECRET`

Important: `NEXTAUTH_URL` and `NEXT_PUBLIC_SERVER_URL` must point at the same origin for the current environment. If they drift apart, successful sign-in and sign-out flows can redirect users to the wrong host or port.

## 3) Demo flow

1. Homepage and collection UX
2. Product detail page, story and recommendations
3. Cart + checkout flow (through payment initiation)
4. Account area (orders, wishlist, addresses)
5. Admin console (`/admin`) for products/orders/media/globals/settings
6. API docs (`/api/v2/docs`) and OpenAPI spec

## 4) Talking points

- One-of-a-kind inventory controls
- Server-side canonical pricing and tax/shipping
- Custom admin experience on Next.js
- Documented API surface with OpenAPI
- PostgreSQL + Drizzle architecture for maintainability
