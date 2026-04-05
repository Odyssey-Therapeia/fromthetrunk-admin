# Cloud Agent Handoff

Use this guide whenever a Cursor Cloud Agent is assigned work in this repository.

## Branch Target

- Primary working branch: `sprint-abe`
- Do not target `main` directly.
- Promotion flow:
  - `sprint-abe` -> `development` (PR only)
  - `development` -> `main` (PR only)

Reference: `docs/branch-policy.md`

## Cloud Environment Baseline

Repository-level cloud setup is defined in:

- `.cursor/environment.json`

Current baseline:

- Install: `npm ci --legacy-peer-deps`
- Runtime terminal: `npm run dev`

## Required Commands For Validation

Run these before opening/merging PRs:

1. `npm run lint`
2. `npm test`
3. `npm run build`

## Required Application Environment Variables

Use values from:

- `.env.example` (local/dev)
- `.env.production.example` (production)

Minimum keys usually required for realistic test/build behavior:

- `DATABASE_URL`
- `PAYLOAD_SECRET`
- `PAYLOAD_PREVIEW_SECRET`
- `NEXT_PUBLIC_SERVER_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- OAuth provider keys (at least one configured)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CRON_SECRET`
- `ADMIN_API_SECRET`

## MCP/Tooling Secret Handling

Global MCP config now references environment variables instead of hardcoded secrets:

- `GITHUB_PERSONAL_ACCESS_TOKEN`
- `MAGIC_MCP_API_KEY`

Set these in your local environment and/or Cursor Cloud Agent Secrets dashboard.

## AI Branch Intake Rule

If Cloud Agents generate side branches (for example `cursor/*`):

1. Never merge directly into `sprint-abe`.
2. Audit with `docs/ai-branch-triage.md` criteria.
3. Import selectively on a dedicated integration branch.
