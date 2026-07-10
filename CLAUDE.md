# Closfa

Aware-intention social media app. TanStack Start (React 19, TS) on Cloudflare Workers, Neon Postgres via Drizzle, Auth0 PKCE (BFF), JWE session cookies (jose), ImageKit media, Upstash Redis rate limiting, Tailwind v4.

## Commands

- `npm run dev` — dev server (Vite)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
- `npm run build` / `npm run deploy` — build / deploy to CF Workers
- `npm run db:push` — Drizzle schema push (NEVER run without explicit user approval)

## Architecture invariants

These are non-negotiable. Full rationale, exemplar files, and code samples live in [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md).

1. **Session decryption happens once** — via the middleware chain. Server functions read `context.session`. Route `beforeLoad` guards use the dedicated session-fetch function. Never double-decrypt.
2. **ORM API separation** — relational reads use object filters; builder writes use operator functions. Never mix. Never silence a filter type error with `as any`.
3. **Every server function validates input** — Zod schemas from the validation layer, shared with client forms. No untyped casts.
4. **Expected failures return structured results** — the error contract (`ok: true | ok: false`) replaces throws for business-logic failures. Throws are for infrastructure faults.
5. **Authorization checks are pure functions** — they receive the session as a parameter. Ownership is verified before writes, never from client-supplied IDs alone.
6. **Edge runtime only** — no Node-only APIs (fs, net, crypto callbacks). Web APIs and edge-compatible libraries only.

## Layout

Discover these directories to understand the codebase structure:

- `src/server/actions/Database/services/` — server functions (business logic + persistence)
- `src/server/lib/` — middleware, session, rate limiting, error contract, bot protection
- `src/server/db/` — ORM schema, relations, cache layer
- `src/verification/` — validation schemas shared between server and client
- `src/routes/_authenticated/` — protected routes; `src/routes/api/auth/` — auth flow
- `src/components/` — feature-grouped components; `ui/` subdirectory for shared primitives

## Conventions

- TypeScript strict; no `any` — fix the type instead
- Path alias `@/` → `src/`
- Explain non-obvious decisions when making changes (this repo doubles as a learning project)
- New code mirrors the closest existing exemplar — when no exemplar fits, propose a pattern before writing

## Model routing — orchestrator + free workers

Rankings: higher = better (1–9). The paid Claude model in this session is the ORCHESTRATOR: it plans, decomposes, delegates, reviews, and ships. Free OpenRouter workers do bulk drafting, analysis, and search via `node .claude/tools/ask-worker.mjs` (fallback chains built in; needs `OPENROUTER_API_KEY`).

| model | cost | intelligence | code | design taste | context | use for |
|---|---|---|---|---|---|---|
| Claude (this session) | 2 | 9 | 9 | 9 | 200K | decisions, architecture, review, final UI polish, anything shipped |
| `qwen/qwen3-coder:free` (`--role code`/`design`) | 9 | 7 | 8 | 6 | 1M | code drafts, whole-repo analysis, first-pass UI |
| `openai/gpt-oss-120b:free` (`--role reason`) | 9 | 7 | 6 | 4 | 131K | reasoning-heavy drafts, analysis, explanations |
| `nvidia/nemotron-3-ultra-550b:free` (`--role bulk`) | 9 | 6 | 5 | 3 | 1M | bulk read/summarize of logs, docs, large files |
| `qwen/qwen3-next-80b:free` (`--role general`) | 9 | 5 | 5 | 4 | 262K | general grunt work, structured extraction |

How to apply:
- **Delegate down** when the task is: summarizing/analyzing large inputs, drafting a well-specified function or component, bulk transformations, research digestion. Give workers a complete, self-contained brief (`--file` for context) — they see nothing else.
- **Escalate back up (do it yourself)** when: multi-file/cross-module changes, anything touching auth/session/data/security, ambiguous requirements, design-taste calls, or a worker's output fails review twice. Free workers draft; you decide, review, and ship. Never commit worker output unreviewed.
- Free-tier limits: 20 req/min, 50 req/day (1,000/day after a one-time $10 credit purchase). If all workers in a chain fail, quota is exhausted or routes changed — fall back to doing it yourself and note it.
- These are defaults, not limits: judge the output, not the price tag. Escalating costs less than shipping mediocre work.

## Skills & tooling

This repo carries an AI development environment in `.claude/` with skills, agents, hooks, and automated quality gates. See [USING_THE_SKILLS.md](./.claude/USING_THE_SKILLS.md) for the full guide.
