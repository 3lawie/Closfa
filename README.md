# Closfa

A full-stack social platform built with TanStack Start, deployed on Cloudflare Workers, and backed by a Neon Postgres database.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | TanStack Start (React 19, TypeScript) |
| **Deployment** | Cloudflare Workers (`@cloudflare/vite-plugin`) |
| **Database** | Neon (serverless Postgres) via Drizzle ORM |
| **Auth** | Auth0 — Authorization Code + PKCE (BFF pattern) |
| **Sessions** | Encrypted JWE cookies via `jose` (stateless, edge-ready) |
| **Media** | ImageKit (HMAC-signed uploads) |
| **Rate limiting** | Upstash Redis (`@upstash/ratelimit`) |
| **Styling** | Tailwind CSS v4 |

---

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run lint       # ESLint
npx tsc --noEmit   # typecheck
npm run db:push    # push Drizzle schema to Neon — review generated SQL first
npm run db:studio  # browse the database
npm run deploy     # build + deploy to Cloudflare Workers
```

---

## Architecture

The full pattern catalog with exemplar files and code samples lives in [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md). These are the core invariants:

### Session integrity
The session JWE is decrypted **exactly once per request** via the middleware chain. Server functions read the session from middleware context — never by calling the decryption function directly. Route `beforeLoad` guards are UI-only and cannot enforce security.

### Input validation
Every server function validates input with a Zod schema from `src/verification/`. Schemas are the single source of truth, shared between server actions and client forms.

### Error contract
Expected failures return a structured `ServerResult<T>` — `{ ok: true, data }` or `{ ok: false, error, message }`. Throws are reserved for unexpected infrastructure faults. Both arms must be handled in the UI.

### Defense in depth
The middleware chain is the **only** real security boundary. It enforces authorization, CSRF (Origin/Host validation), and rate limiting. Route guards only protect navigation. Ownership checks are pure functions receiving the session — never trusting client-supplied IDs alone.

### ORM discipline
Drizzle exposes two APIs with incompatible syntax: `db.query.*` (relational reads → object filters) and `db.update/delete/insert` (builder writes → operator functions). Never mix them. Never silence a type error with `as any`.

### Layered server structure
New features follow the **service / verifier / validation** triangle. Services own DB access, verifiers are pure authorization functions, validation schemas are shared. Nothing in `src/components/` or `src/lib/` imports from `src/server/`.

---

## AI Tooling

This repo includes an AI development environment in [`.claude/`](./.claude/) with:

- **8 skills** — system-design, patterns, web-design-patterns, creative-ui, full-review, teach, debug, refactor
- **5 reviewer agents** — system, code, security, UI, UX (run in parallel via `/full-review`)
- **5 lifecycle hooks** — auto-format on edit, destructive command guard, stop-time verification (lint + typecheck), session context injection, completion notification
- **Automated quality gates** — every task must pass lint and typecheck before the agent can finish

How to drive it: [USING_THE_SKILLS.md](./.claude/USING_THE_SKILLS.md).
