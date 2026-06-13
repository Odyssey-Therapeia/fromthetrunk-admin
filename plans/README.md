# plans/ — the execution planning system

This directory is the durable, git-versioned plan of record for the Shopify-parity programme. Plans are written by the principal agent (Fable-class model); they are **executed by smaller models** (haiku/sonnet) through the agents in `.claude/agents/` and the `/ship` skill. The plan is the contract: an executor never improvises beyond its packet.

## Files

- `000-master-plan.md` — requirements, target architecture, phase map, orchestration topology, risk register. Read this first.
- `P1-stabilize.md` … `P6-parity-polish.md` — one file per phase. Each contains scoped **work packets** with IDs (`P3-07`), checkboxes, and verification.
- A phase plan is *active* when STATE.md names it. Exactly one phase is active at a time.

## The work packet — the only unit of execution

Every packet is self-contained. A small model must be able to execute it cold. Required fields:

```markdown
### P2-04: <imperative title>
- **Objective**: one sentence; the observable outcome.
- **Files**: exact paths the worker may touch. Anything else = stop and report.
- **Must not**: explicit non-goals / files to leave alone.
- **Spec**: the behaviour, with code-level pointers (file:line of the current state).
- **Tests first**: the test(s) to write/extend BEFORE implementation (TDD unless marked mechanical).
- **Verify**: exact commands that must pass (`npm test`, `npx tsc --noEmit`, a curl, a grep).
- **Evidence**: what the verifier must see to call it done.
- **Depends**: packet IDs that must be done first. No entry = parallel-safe.
```

Checkbox discipline (same as the workstream rule): `- [ ]` open; `- [x]` done **only** with a one-line completion note: date + commit sha + verify output summary. Claims without evidence don't close boxes.

## The verification ladder

"Done" is objective. Every packet states which rungs apply; the verifier runs them, the maker never grades itself.

| Rung | Check | Command |
|---|---|---|
| L0 | Types + lint | `npx tsc --noEmit && npm run lint` |
| L1 | Unit tests | `npm test` |
| L2 | Route tests (mocked-db Hono pattern — see `tests/unit/admin-user-management-routes.test.ts`) | `npm test` |
| L3 | E2E (Playwright against `next dev`/preview) | `npx playwright test <spec>` |
| L4 | Performance | `npm run lhci` (budgets in `lighthouserc.cjs`) |
| L5 | Adversarial review | `fable-reviewer` agent on the diff vs the packet spec |
| L6 | Human gate | `#G-` checkpoint — summarized evidence, user decides |

Minimum for any code packet: L0 + L1 + L5. Money-path, auth, or schema packets add L2. UI packets add L3 (and L4 when they touch public pages).

## Orchestration patterns (how the pipeline runs)

- **Per-packet pipeline**: `repo-scout` (context capsule) → `implementation-worker` (TDD execution) → `verifier` (fresh context, runs the ladder) → if FAIL, worker retries with the verifier's findings, **max 2 loops** → `fable-reviewer` (adversarial diff review) → orchestrator updates the plan checkbox + STATE.md → commit (packet-scoped paths only — *never* `git add .`; see P1-01).
- **Phase fan-out**: packets with no `Depends` run in parallel (Workflow tool, worktree isolation when file scopes overlap). Dependent packets pipeline. Phase ends at a barrier: all boxes checked → gate.
- **Escalation rule**: 2 failed verify loops → packet marked `BLOCKED` in the plan with the failure evidence pasted, logged in STATE.md "New known failure modes". A Fable-class session re-specs the packet. Small models never redesign.
- **Spikes**: every phase opens with a discovery packet (`Pn-00`) that produces a findings doc in `docs/`, not code. This is the budget for unknown unknowns.
- **Long phases**: run autonomously via `/workstream-work` + `/goal` (the workstream kit), or `/loop` for repeating verify-fix cycles. `#G-` gates always stop autonomous runs.

## Design-system guardrail (UI does not drift)

UI packets must: use existing shadcn/Radix components and the Tailwind v4 token variables; introduce **no raw hex colors, no arbitrary px spacing, no new fonts**; follow `.claude/skills/nextjs-frontend` (mobile-first). The verifier greps the diff for `#[0-9a-fA-F]{3,6}` and `\b\d+px\b` in classNames as a mechanical drift check; `fable-reviewer` judges the rest. P2-10 establishes `docs/design-system.md` as the single token contract.

## Relationship to the workstream kit

`plans/` holds the durable content (architecture, packets) — correctly in the repo proper per the workstream rules. A workstream's Backlog may *reference* phase plans ("work P2 per plans/P2-foundation.md") but never mirrors packet lists — one tracker per tier. `STATE.md` (repo root) is the cross-session memory protocol: read at session start, updated at session end. `.state/ACTIVE.md` remains the workstream pointer.
