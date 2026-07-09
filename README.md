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

## Server Architecture Rules

These are enforced conventions that every contributor must follow. They exist to prevent subtle bugs, double-decryption, and security regressions. The full pattern catalog with exemplar files lives in [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md).

---

### Rule 1 — Session Access: `authMiddleware` vs `getSession()`

The session JWE is expensive to decrypt (cryptographic operation). It must be decrypted **exactly once per request**. Never call `getSession()` inside a `createServerFn` handler — use `context.session` from the middleware chain instead.

| Location | Correct Pattern | Why |
| :--- | :--- | :--- |
| `createServerFn` handlers (auth required) | `.middleware([authMiddleware])` → read `context.session` | Decrypts once, runs CSRF check, passes session via context |
| `createServerFn` handlers (public + auth mixed) | `.middleware([rateLimitMiddleware(...)])` | No auth enforcement, reads session optionally for rate key |
| Route `beforeLoad` guards (`_authenticated.tsx`) | `getSessionFn()` → `getSession()` internally | Route guards are not server functions; middleware chain does not apply |
| Route `beforeLoad` public pages | `optionalAuthGuard()` / `getSessionFn()` | Same as above — route-level context only |
| Verifiers (`auth.ts`, `permissions.ts`) | Receive `session` as a **parameter** | Pure functions called from within handlers that already hold the session |

> **Never** call `getSession()` inside a `.handler()` body when `authMiddleware` is already in the chain. This decrypts the JWE **twice** per request and skips the CSRF Origin check.
>
> Remember: route `beforeLoad` guards only protect UI navigation. An attacker can POST to a server function directly — **the middleware chain is the real security boundary** (see `src/server/lib/middleware.ts`).

```typescript
// ✅ Correct
export const createPost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context.session  // ← session from middleware, decrypted once
  })

// ❌ Wrong — double decryption + CSRF bypass
export const createPost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async () => {
    const session = await getSession()  // ← decrypts again, skips CSRF check
  })
```

---

### Rule 2 — Drizzle Query Syntax

Drizzle exposes two distinct internal APIs. Each has its own filter syntax. Mixing them causes type errors or silent wrong queries.

| API | When to Use | Filter Syntax |
| :--- | :--- | :--- |
| **Relational API** — `db.query.*` | Read operations with joins / relations | Plain objects: `{ field: value }` |
| **SQL Builder API** — `db.update / delete / select` | Write operations and complex reads | Operator functions: `eq()`, `and()`, `or()` |

```typescript
// ✅ Relational API — object filters are parsed by Drizzle's relational layer
const user = await db.query.user.findFirst({
  where: { email: 'user@example.com' },  // ← plain object ✓
  with: { profile: true },
})

// ✅ SQL Builder API — operators generate raw SQL, objects are not supported
await db.update(schema.user)
  .set({ nickname: 'newname' })
  .where(eq(schema.user.userId, userId))  // ← eq() required ✓

// ❌ Wrong — object filter in SQL Builder throws a TypeScript error
await db.update(schema.user)
  .set({ nickname: 'newname' })
  .where({ userId: userId })              // ← does not compile ✗
```

**Rules:**
- `db.query.*` → use `{ field: value }` objects
- `db.update / delete / insert` → use `eq()`, `and()`, `or()` from `drizzle-orm`
- Do not import `eq` in files that only use `db.query.*`
- Never silence a filter type error with `as any` — it usually means you're on the wrong API

---

### Rule 3 — Validation and Results

Every `createServerFn` validates its input with a Zod schema from `src/verification/` via `.inputValidator(schema)`, and returns a `ServerResult<T>` (`src/server/lib/result.ts`) for expected failures instead of throwing. Details and examples: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) §3–4.

---

## AI Tooling

This repo carries a Claude Code environment in `.claude/` that enforces the rules above:

- `CLAUDE.md` — always-loaded facts and invariants for the agent
- `/teach`, `/patterns`, `/full-review` and more — skills in `.claude/skills/`
- Specialized reviewers (system, code, security, UI, UX) in `.claude/agents/`
- Hooks in `.claude/hooks/` — auto-lint on edit; destructive commands (db push, deploy, force-push) are blocked and left to the developer

How to drive it: see [`.claude/USING_THE_SKILLS.md`](./.claude/USING_THE_SKILLS.md).
