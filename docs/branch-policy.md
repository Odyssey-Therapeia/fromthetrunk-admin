# Branch Promotion Policy

This repository uses a linear promotion model:

1. `sprint-abe` (active development)
2. `development` (staging/integration)
3. `main` (production)

## Required Promotion Flow

- All feature/fix work lands in `sprint-abe`.
- Promote to `development` using pull requests only.
- Promote to `main` using pull requests only.
- Direct pushes to `development` and `main` are disallowed by policy.

## Automation Guardrail

The workflow `.github/workflows/enforce-pr-only.yml` runs on push to `development` and `main` and fails if the pushed commit is not associated with a pull request.

This repository currently cannot use GitHub branch protection/rulesets due plan limitations on the current GitHub tier, so this workflow is the in-repo enforcement mechanism.

## Cloud Agent Branch Rule

- Cloud agents must start from `sprint-abe` or a short-lived branch created from `sprint-abe`.
- Cloud agents should never target `main` directly.
- Promotion PR order remains:
  - `sprint-abe` -> `development`
  - `development` -> `main`
