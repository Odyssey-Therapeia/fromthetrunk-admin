# Payload Setup and Seed Flow

## Environment Prerequisites

Set the variables in `.env.example` before running migrations or seed tasks:

- `DATABASE_URL`
- `PAYLOAD_SECRET`
- `PAYLOAD_PREVIEW_SECRET`
- `NEXT_PUBLIC_SERVER_URL`

## Fresh Environment Sequence

Run the following commands in order:

```bash
npm install
npm run payload:types
npm run payload:migrate
npm run seed:payload
```

If you need to create a migration first, use:

```bash
npm run payload:migrate:create -- migration_name_here
```

## Seed Idempotency

`scripts/seed-payload.ts` is slug-aware:

- Existing products with matching `slug` are skipped.
- Re-running `npm run seed:payload` does not duplicate existing products.
