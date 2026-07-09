# Design Patterns

Architectural decisions and patterns that govern this codebase. Each pattern names its **governing principle**, **exemplar file** (the living reference to mirror), and any **known drift** (code that predates the rule).

> Enforcement: these patterns are validated by the `.claude` reviewer agents (`/full-review`) and referenced by the `/patterns` skill. When code and this document disagree, fix one of them — never let them drift silently.

---

## 1. Authentication — Backend-for-Frontend (BFF)

**Principle:** Tokens never reach the client. The server is the only actor that holds credentials.

**Exemplar:** `src/server/actions/ThirdParty/OAuth/auth0.service.ts`, `src/server/lib/session.ts`

- **No SPA tokens**: The client browser never receives JWT access tokens.
- **Encrypted session**: Once authenticated, the server encrypts the session payload using JWE and sends an `HttpOnly`, `SameSite=Lax` cookie.
- **Reduced XSS blast radius**: Script injection cannot steal tokens because they never leave the server. (XSS itself is still mitigated separately — React escaping, no `dangerouslySetInnerHTML` with user content.)

---

## 2. Sliding Window Sessions

**Principle:** Sessions balance convenience (don't log out mid-task) with security (don't live forever).

**Exemplar:** `src/server/lib/session.ts`

- **Threshold renewal**: Sessions renew automatically when passing a 25% expiration threshold.
- **Absolute cap**: A 30-day absolute expiration (`issuedAt` tracking) forces re-authentication regardless of activity.
- **Decrypt once per request**: The JWE is decrypted exactly once by the middleware chain. Server function handlers read `context.session` — never calling the session decryption function directly. See CLAUDE.md invariant 1.

---

## 3. Error Contract — Result Unions

**Principle:** Expected failures are values, not exceptions. The caller is forced to handle both arms.

**Exemplar:** `src/server/lib/result.ts`, consumed by verifiers in `src/server/actions/Database/verifiers/`

```typescript
type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string; issues?: ZodIssue[] }
```

**Rule of thumb:** *expected* failures (not found, forbidden, invalid input) return `{ ok: false, ... }`; `throw` is reserved for *unexpected* infrastructure failures (DB down, crypto error).

> ⚠️ Known drift: some services (e.g. `post.service.ts`) still `throw new Error(...)` for expected cases. The pattern stands; the code must catch up. Do not copy the throwing style into new services.

---

## 4. Input Validation — Schema-First

**Principle:** Every external input is validated at the boundary. Schemas are the single source of truth for shape, shared between server and client.

**Exemplar:** `src/verification/post.validation.ts`

- Every `createServerFn` must have `.inputValidator(schema)` using Zod.
- Schemas are centralized in `src/verification/` so client forms and server functions share the same contract.
- A handler that reads `data as any` is a violation — the validated type flows from the schema (`z.infer`).

> ⚠️ Known drift: `post.service.ts` handlers currently use `data as any` with no validator. Fixing these is the reference exercise for the `/teach` skill.

---

## 5. Defense in Depth

**Principle:** Every layer adds its own check. If one layer fails, the next catches it. The middleware chain is the only real security boundary — route guards are cosmetic.

| Defense | Implementation | Exemplar |
|---|---|---|
| **Authorization** | `authMiddleware` on every state-changing server function | `src/server/lib/middleware.ts` |
| **CSRF** | Strict Origin + Host validation in the middleware | `src/server/lib/middleware.ts` |
| **Rate limiting** | Upstash Redis with composite IP+UA key for anonymous users | `src/server/lib/rateLimiter.ts` |
| **Bot protection** | Cloudflare Turnstile on abuse-prone forms | `src/server/lib/turnstile.ts` |
| **Ownership checks** | Pure verifier functions using the session's userId — never a client-supplied ID alone | `src/server/actions/Database/verifiers/auth.ts` |

---

## 6. ORM Standards — Drizzle

**Principle:** The ORM has two distinct APIs with incompatible filter syntax. Using the wrong one causes type errors or silent wrong queries.

**Exemplar:** CLAUDE.md invariant 2; schema in `src/server/db/schema.ts`

| API | Use for | Filter syntax |
|---|---|---|
| **Relational** — `db.query.*` | Read operations with joins/relations | Object syntax: `{ field: value }` |
| **Builder** — `db.update/delete/insert` | Write operations and complex reads | Operator functions: `eq()`, `and()`, `or()` |

**Rules:**
- Never mix syntax across APIs
- Never silence a filter type error with `as any` — it means you're on the wrong API
- Never loop awaited single-row queries (N+1) — use batch `insert(...).values([...])` and `inArray()`

---

## 7. Layered Server Structure

**Principle:** Separation of concerns via a service/verifier/validation triangle. Routes and components never access persistence directly.

| Layer | Location | Responsibility |
|---|---|---|
| **Service** (server functions) | `src/server/actions/Database/services/` | Business logic + DB access |
| **Verifier** (pure authorization) | `src/server/actions/Database/verifiers/` | Ownership/permission checks; receives `session` as parameter |
| **Validation** (Zod schemas) | `src/verification/` | Input shape, shared with client forms |

**Boundary rule:** nothing under `src/components/` or `src/lib/` imports from `src/server/` — this prevents environment leakage and bundle bloat.
