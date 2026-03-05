# AI Branch Triage Notes

This document captures guidance for reviewing large AI-generated branches against the current baseline branch.

## Triage goals

- Preserve the current runtime architecture:
  - Next.js App Router
  - Hono API v2
  - Drizzle query/schema layer
  - custom `(admin)` workspace
- Import useful CI/test improvements without reintroducing obsolete architecture.

## Import strategy

1. Start from a fresh integration branch based on the current baseline.
2. Cherry-pick only focused commits (CI, test tooling, lint rules).
3. Manually reconcile workflow/config files.
4. Run lint/test/build after each logical import set.

## High-risk changes to reject

- Any route or config change that removes `/api/v2` Hono routing.
- Any change that replaces current Drizzle data layer with deprecated alternatives.
- Any change that removes current admin workspace and role-guarded layout.

## Validation checklist

- OpenAPI docs still available at `/api/v2/docs`
- Core account/checkout flows still pass manual acceptance
- CI still runs lint + tests + build in expected order
