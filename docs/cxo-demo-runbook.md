# CXO Demo Runbook

Use this runbook in the final hours before the demo to confirm From the Trunk is production-ready and polished.

## 1) Pre-demo setup (10-15 minutes)

Run these commands from the repository root:

```bash
npm run generate:icons
npm run demo:check
```

If the database is empty, seed products and rerun checks:

```bash
npm run seed:payload
npm run demo:check
```

> Tip: If you need to validate env/assets only without DB access, run:
>
> `DEMO_CHECK_SKIP_DB=true npm run demo:check`

## 2) Environment variables to confirm in Vercel

- `DATABASE_URL`
- `PAYLOAD_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SERVER_URL`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or another complete OAuth pair)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CRON_SECRET`
- `ADMIN_API_SECRET`

## 3) Demo flow (happy path)

1. **Homepage**
   - Show announcement bar and hero
   - Call out trust strip metrics and featured collection
2. **Collection**
   - Open “Explore the Collection”
   - Use filters and open a product
3. **Product detail**
   - Explain story + provenance
   - Show curated “same era / similar weave” recommendations
4. **Cart and checkout**
   - Add to bag, open cart drawer, proceed to checkout
   - Stop at Razorpay step (no live payment needed)
5. **Account experience**
   - Show wishlist/orders areas
6. **Admin/CMS**
   - Open Payload admin and show content editability

## 4) Suggested CXO talking points

- **Luxury + sustainability**: provenance-verified pre-loved sarees
- **Commerce maturity**: reservation flow, taxation, shipping tiers, payment integration
- **Operational readiness**: seed scripts, readiness checks, CMS-driven content updates
- **Scalability**: Next.js + Payload + PostgreSQL architecture with deployment flexibility

## 5) Fast fallback plan

- If newsletter provider is unavailable, subscription still succeeds with graceful UX.
- If a product search is too narrow, use suggested query chips (`Banarasi`, `Silk`, etc.).
- If asked about deployment confidence, run `npm run demo:check` and share pass/fail output.
