# AGENTS.md

## Learned User Preferences

- Plan files (`.cursor/plans/*.plan.md`) are read-only for the agent; never edit them -- drive work through existing todos, mark in_progress, and complete all
- Verify fixes visually in the browser or with real output before claiming success; build/lint passing alone is not sufficient
- Prefers execution over explanation -- "do it for me", "fix and push" style; only ask for missing inputs, do not over-explain
- Use parallel subagents where possible for planning and multi-phase implementation
- Remove instrumentation, debug logging, and temporary scaffolding immediately after the issue they address is resolved
- Push changes across all relevant branches (sprint-abe, development, main) when explicitly asked; do not silently skip branches
- Admin UI should be polished with search, filters, quick actions, toasts, and feedback -- not minimal tables
- Product creation uses a guided stepper with live preview, not the default Payload admin form
- Do not prematurely clean up or delete infrastructure (Neon databases, legacy data, old branches) unless explicitly instructed
- Commit to the final target architecture on the working branch; avoid interim half-measures or throwaway scaffolding
- When the user provides screenshots or terminal logs, diagnose the specific issue shown rather than guessing context
- Secrets must never be committed or stored in code; rotate any tokens that appear in chat transcripts

## Learned Workspace Facts

- Project is "From the Trunk" (FTT) -- curated pre-loved luxury sarees with provenance
- GitHub org: Odyssey-Therapeia, repo: FTT-fromthetrunk
- Production host: www.fromthetrunk.shop; contact: hello@fromthetrunk.com
- Branch strategy: sprint-abe (active dev) -> development (staging) -> main (production)
- Architecture migration in progress: Payload CMS -> custom stack (Drizzle ORM + Hono/OpenAPI + NextAuth + custom admin UI)
- Target stack: Neon Postgres, Drizzle, Hono, NextAuth, Next.js 16+, shadcn, GSAP, Tailwind, TanStack Query, Zustand
- Neon Postgres: multiple databases exist; the "FTT from Feb 8th" project is the legacy Payload-connected production DB
- Vercel deployment; preview domains follow ftt-fromthetrunk-git-{branch}-odyssey-therapeia.vercel.app
- Local dev: npm run dev with .env.local, localhost:3000, admin at /admin
- API routes: /api/v2/* (Hono custom), /api/payload/* (legacy Payload, being phased out)
- Continual-learning index path: .cursor/hooks/state/continual-learning-index.json
- VPN can cause DNS resolution failures for github.com and api.vercel.com; turning VPN off resolves connectivity issues
