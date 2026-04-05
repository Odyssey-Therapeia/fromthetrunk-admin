# AGENTS.md

## Learned User Preferences

- Plan files (`.cursor/plans/*.plan.md`) are read-only for the agent; never edit them -- drive work through existing todos, mark in_progress, and complete all
- Verify fixes visually (including narrow/mobile viewports) before claiming success; when the user shares screenshots or terminal logs, diagnose what they show—build, lint, or tests passing is not enough if the UI still looks wrong
- Prefers execution over explanation -- "do it for me", "fix and push" style; only ask for missing inputs, do not over-explain; use parallel subagents where helpful for planning and multi-phase work
- Track `.cursor/rules` in git and push rule changes with the repo; treat them as shared team standards, not local-only files
- Remove instrumentation, debug logging, and temporary scaffolding immediately after the issue they address is resolved
- Push changes across all relevant branches (sprint-abe, development, main) when explicitly asked; do not silently skip branches
- Admin UI should be polished (search, filters, quick actions, toasts, feedback—not minimal tables); product creation uses a guided stepper with live preview, not the default Payload admin form
- Do not prematurely clean up or delete infrastructure (Neon databases, legacy data, old branches) unless explicitly instructed
- Commit to the final target architecture on the working branch; avoid interim half-measures or throwaway scaffolding
- Secrets must never be committed or stored in code; rotate any tokens that appear in chat transcripts
- Keep global Cursor rules language-agnostic for reuse across many repos; add stack-specific frontend rules via globs (for example `**/*.tsx`, `components/**`) for layout, shadcn, and Tailwind patterns
- Optional repo-root `CLAUDE.md` for long-form project brief; keep `AGENTS.md` as the durable learned-memory file and link to `CLAUDE.md` when both exist to avoid duplicating long guidance

## Learned Workspace Facts

- Project is "From the Trunk" (FTT) -- curated pre-loved luxury sarees with provenance
- GitHub org: Odyssey-Therapeia, repo: FTT-fromthetrunk
- Production: www.fromthetrunk.shop; contact hello@fromthetrunk.com; Instagram https://www.instagram.com/from.thetrunk/
- Primary developer for this workspace goes by Abe
- Branch strategy: sprint-abe (active dev) -> development (staging) -> main (production)
- Architecture migration in progress: Payload CMS -> custom stack (Drizzle ORM + Hono/OpenAPI + NextAuth + custom admin UI)
- Target stack: Neon Postgres, Drizzle, Hono, NextAuth, Next.js 16+, shadcn (v4 / Base UI direction where adopted), GSAP, Tailwind v4, TanStack Query, Zustand; Tailwind is the primary responsive layout layer for storefront UI
- Neon Postgres: multiple databases exist; the "FTT from Feb 8th" project is the legacy Payload-connected production DB
- Vercel deployment; preview domains follow ftt-fromthetrunk-git-{branch}-odyssey-therapeia.vercel.app
- Local dev: npm run dev with .env.local, localhost:3000, admin at /admin; API routes `/api/v2/*` (Hono custom), `/api/payload/*` (legacy Payload, being phased out)
- Continual-learning index path: .cursor/hooks/state/continual-learning-index.json
- VPN can cause DNS resolution failures for github.com and api.vercel.com; turning VPN off resolves connectivity issues
