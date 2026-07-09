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

## Skills & tooling

This repo carries an AI development environment in `.claude/` with skills, agents, hooks, and automated quality gates. See [USING_THE_SKILLS.md](./.claude/USING_THE_SKILLS.md) for the full guide.
