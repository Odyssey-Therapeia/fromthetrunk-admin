# AGENTS.md

## Learned User Preferences

- Plan files (`.cursor/plans/*.plan.md`) are read-only for the agent; never edit them -- drive work through existing todos, mark in_progress, and complete all
- Verify fixes visually (including narrow/mobile viewports) before claiming success; when the user shares screenshots or terminal logs, diagnose what they show—build, lint, or tests passing is not enough if the UI still looks wrong
- Prefers execution over explanation -- "do it for me", "fix and push" style; only ask for missing inputs, do not over-explain; use parallel subagents where helpful for planning and multi-phase work
- Track `.cursor/rules` in git as shared team standards; keep global rules language-agnostic, add stack-specific frontend rules via globs (e.g., `**/*.tsx`, `components/**`) for layout, shadcn, and Tailwind patterns
- Remove instrumentation, debug logging, and temporary scaffolding immediately after the issue they address is resolved
- Push changes across all relevant branches (sprint-abe, development, main) when explicitly asked; do not silently skip branches
- Admin UI should be polished (search, filters, quick actions, toasts, feedback—not minimal tables); product creation uses a guided stepper with live preview, not the default Payload admin form
- Do not prematurely clean up or delete infrastructure (Neon databases, legacy data, old branches) unless explicitly instructed
- Commit to the final target architecture on the working branch; avoid interim half-measures or throwaway scaffolding
- Secrets must never be committed or stored in code; rotate any tokens that appear in chat transcripts
- Hexagonal architecture (ports & adapters) required for AI/agent systems; strict separation of UI from agent logic; orchestration engine (AI SDK, LangGraph, etc.) must be pluggable
- Always build mobile-first responsive layouts by default; use Tailwind v4 container queries (`@container`) for component-level responsiveness; viewport queries only for page scaffolding
- For any UI, storefront, admin UI, layout, checkout, form, accessibility, SEO, animation, or performance-facing change, agents must run `npm run agent:check` before claiming completion. Authenticated admin Lighthouse requires `FTT_LHCI_AUTH_EMAIL` and `FTT_LHCI_AUTH_PASSWORD`; never commit those secrets. If the full gate cannot run, report the exact blocker and at minimum run the narrower relevant commands (`npm test`, `npm run lint`, `npm run build`, `npm run verify:ux`).
- Optional repo-root `CLAUDE.md` for long-form project brief; keep `AGENTS.md` as the durable learned-memory file and link to `CLAUDE.md` when both exist to avoid duplicating long guidance

## Learned Workspace Facts

- Project is "From the Trunk" (FTT) -- curated pre-loved luxury sarees with provenance
- GitHub org: Odyssey-Therapeia, repo: FTT-fromthetrunk
- Production: www.fromthetrunk.shop; contact hello@fromthetrunk.com; Instagram https://www.instagram.com/from.thetrunk/
- Primary developer for this workspace goes by Abe
- Branch strategy: sprint-abe (active dev) -> development (staging) -> main (production)
- Architecture migration in progress: Payload CMS -> custom stack (Drizzle ORM + Hono/OpenAPI + NextAuth + custom admin UI)
- Target stack: Neon Postgres, Drizzle, Hono, NextAuth, Next.js 16+, shadcn (v4 / Base UI direction), GSAP, Tailwind v4, TanStack Query, Zustand, Bun (package management); Tailwind is the primary responsive layout layer for storefront UI
- Neon Postgres: multiple databases exist; the "FTT from Feb 8th" project is the legacy Payload-connected production DB; server-side Drizzle uses Neon's HTTP SQL path (`neon` + `drizzle-orm/neon-http`) instead of the WebSocket pool for more reliable queries on restrictive or flaky networks
- Vercel deployment; preview domains follow ftt-fromthetrunk-git-{branch}-odyssey-therapeia.vercel.app
- Local dev: npm run dev with .env.local, localhost:3000, admin at /admin; API routes `/api/v2/*` (Hono custom), `/api/payload/*` (legacy Payload, being phased out)
- AI agent infrastructure in progress: product creation assistant using Claude (`@ai-sdk/anthropic`), admin chat UI via `@assistant-ui/react` + `@assistant-ui/react-ai-sdk`; agent kernel at `lib/ai/`, API route at `app/api/chat/route.ts`; hexagonal architecture with ports & adapters for pluggable orchestration
- Internal frontend docs being built at `docs/internal/`; `nextjs-frontend.mdc` cursor rule enforces layout, responsive, and component patterns across the frontend
- Continual-learning index path: .cursor/hooks/state/continual-learning-index.json
- Vercel CLI installed globally and project linked via `vercel link`; use `vercel env add` to manage secrets across production/preview/development environments
- Drizzle convenience scripts in package.json: `db:push`, `db:generate`, `db:migrate`, `db:studio`
- All `db/queries/*.ts` read operations are wrapped in `withRetry()` for resilience against transient Neon connection failures
- VPN or split-tunnel setups can cause DNS resolution failures or uneven HTTPS connectivity for github.com, api.vercel.com, and Neon Postgres from the dev machine (Node fetch may behave differently than curl); turning VPN off or adjusting tunneling often resolves it
