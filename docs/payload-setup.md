# Platform Setup (Current Stack)

> Note: this file name is kept for continuity, but setup now targets the current Next.js + Hono + Drizzle stack.

## Environment prerequisites

Set required values in `.env.example` / `.env.local`:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- OAuth provider credentials (at least one provider)
- Razorpay keys
- Resend API key
- `CRON_SECRET`
- `ADMIN_API_SECRET`

## Local startup

```bash
npm install --legacy-peer-deps
npm run dev
```

## Optional legacy-data import

If you need to import historical data into the current schema:

```bash
npm run migrate:payload-to-drizzle
```

For dry-run and truncate options, see:
- [`docs/rebuild-data-migration.md`](./rebuild-data-migration.md)
