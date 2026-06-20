# Closfa

A full-stack social platform built with TanStack Start, deployed on Cloudflare Workers, and backed by a Neon Postgres database.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | TanStack Start (React, TypeScript) |
| **Deployment** | Cloudflare Workers (`@cloudflare/vite-plugin`) |
| **Database** | Neon (serverless Postgres) via Drizzle ORM |
| **Auth** | Auth0 — Authorization Code + PKCE (BFF pattern) |
| **Sessions** | Encrypted JWE cookies via `jose` (stateless, edge-ready) |
| **Media** | ImageKit (HMAC-signed uploads) |
| **Styling** | Tailwind CSS v4 |

---

## Development

```bash
npm install
npm run dev
```

---

## Server Architecture Rules

These are enforced conventions that every contributor must follow. They exist to prevent subtle bugs, double-decryption, and security regressions.

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

---

## Architecture Guide

For the full server security design — session renewal flows, rate limiting tiers, CSRF hardening, onboarding, subscription schema, and the complete refactor plan — see the [Auth Architecture Guide](../../Users/Alimuhannad/.gemini/antigravity-ide/brain/2d904e77-1420-4803-96ee-50d31e57976a/auth_architecture_guide.md).
