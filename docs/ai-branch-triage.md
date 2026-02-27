# AI Branch Triage: `cursor/automated-testing-and-ci-cd-d9d1`

## Purpose

This document captures a read-only audit of `origin/cursor/automated-testing-and-ci-cd-d9d1` versus `sprint-abe`, and defines what should be imported (or avoided) to keep `sprint-abe` as the stable base branch.

## Divergence Snapshot

- `sprint-abe` is ahead of `development` and `main`.
- `origin/cursor/automated-testing-and-ci-cd-d9d1` is heavily diverged from `sprint-abe`.
- A direct merge is high risk because the branch reverts recent `sprint-abe` platform updates.

## What The AI Branch Is Strong At

- CI/CD hardening and stricter quality gates
- Large expansion of unit/integration tests
- Artifact verification scripts for coverage/JUnit and deployment bundles

## High-Risk Regressions If Merged Directly

Do not merge these directly from the AI branch:

- `app/(payload)/admin/[[...segments]]/page.tsx`
- `app/(payload)/layout.tsx`
- `app/(payload)/payload-admin-server-function.ts`
- `app/(site)/collection/[slug]/page.tsx`
- `payload.config.ts`
- `tsconfig.json`
- `docs/architecture.md`
- `docs/migration-guide.md`

These changes would undo `sprint-abe` improvements such as:

- `@payload-config` alias usage
- Promise-based dynamic params for Next.js 15/16
- PostgreSQL pool tuning in `payload.config.ts`
- newly added architecture/migration documentation

## Selective Import List

### Import Now (low-to-medium risk, high value)

- `.github/workflows/ci.yml` (manual merge, not blind replace)
- `scripts/coverage-summary.mjs`
- `scripts/verify-deployment-bundle.mjs`
- `scripts/verify-test-artifacts.mjs`
- New tests under `tests/integration/` and `tests/unit/`
- `vitest.config.ts` (coverage config only, reconcile manually)
- `package.json` and `package-lock.json` (only relevant CI/test script updates)

### Import Later (after initial stabilization)

- Additional strict artifact canonicalization checks from later hardening commits
- Optional stricter coverage policy thresholds

### Skip

- Any app/config change that reverts `sprint-abe` payload alias, DB pool, or Next 15/16 async param behavior

## Candidate Commit Seeds

The following AI-branch commits are useful starting points for selective cherry-picking on an integration branch:

- `7d97d98` modernize CI workflow
- `14c629f` add manual CI workflow dispatch
- `18e0b68` add coverage summary tooling
- `b5dd32c` add deployment packaging script integration
- `2814a89` verify deployment bundle in CI parity
- `ee3f45c` verify test artifacts before publishing
- `50a6907` add workflow permissions/timeouts

Apply these only into a dedicated integration branch from `sprint-abe`, then open a PR back into `sprint-abe`.
