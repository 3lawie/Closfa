# Closfa

Aware-intention social media app. TanStack Start (React 19, TS) on Cloudflare Workers, Neon Postgres via Drizzle, Auth0 PKCE (BFF), JWE session cookies (jose), ImageKit media, Upstash Redis rate limiting, Tailwind v4.

## Commands

- `npm run dev` — dev server (Vite)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck
- `npm run build` / `npm run deploy` — build / deploy to CF Workers
- `npm run db:push` — Drizzle schema push (NEVER run without explicit user approval)

## Architecture rules (mandatory — full detail in README.md and DESIGN_PATTERNS.md)

1. **Session access:** protected `createServerFn` → `.middleware([authMiddleware])`, read `context.session`. NEVER call `getSession()` inside a handler that already has authMiddleware (double JWE decryption + CSRF bypass). Route `beforeLoad` guards use `getSessionFn()`.
2. **Drizzle syntax:** `db.query.*` reads → plain object filters `{ field: value }`. `db.update/delete/insert` writes → operator functions `eq()`, `and()` from `drizzle-orm`. Never mix.
3. **Every `createServerFn` must have a Zod `.inputValidator(schema)`** — schemas live in `src/verification/`. No `data as any`.
4. **Return `ServerResult<T>`** (`src/server/lib/result.ts`) from server actions — no bare throws for expected failures.
5. **Verifiers are pure functions** (`src/server/actions/Database/verifiers/`) that receive `session` as a parameter.
6. **Cloudflare Workers runtime:** no Node-only APIs (fs, net, crypto callbacks); use Web APIs.

## Layout

- `src/server/actions/Database/services/` — server functions (post, feed, user, comment, follow, moderation)
- `src/server/lib/` — middleware, session, rateLimiter, result, turnstile
- `src/server/db/` — Drizzle schema, relations, redis
- `src/verification/` — Zod schemas shared client/server
- `src/routes/_authenticated/` — protected routes; `src/routes/api/auth/` — Auth0 flow
- `src/components/` — feature-grouped React components; `ui/` for primitives

## Conventions

- TypeScript strict; no `any` — fix the type instead
- Path alias `@/` → `src/`
- Explain non-obvious decisions when making changes (this repo doubles as a learning project)
