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

---

## 8. Environment Variables — Schema-Validated at the Boundary

**Principle:** `process.env` is external input, same category as a request body — pattern 4 already says every external input is validated at the boundary. Env vars are the one boundary this codebase currently skips.

**Exemplar (missing):** the established, framework-agnostic version of this is `@t3-oss/env-core` (Zod schema, validated once at module load, fails fast on a misconfigured deploy instead of failing deep inside a request); a hand-rolled `z.object({...}).parse(process.env)` in `src/lib/env/server-env.ts` gets the same guarantee with no new dependency.

> ⚠️ Known drift (found 2026-07-11): `src/lib/env/server-env.ts` uses non-null assertions (`process.env.DATABASE_URL!`) — TypeScript is told the value exists; nothing actually checks. A missing var surfaces as an obscure runtime error wherever it's first read, not at boot. `src/lib/env/client-env.ts` is worse: `imagekitPublicKey`, `auth0Domain`, `auth0ClientId` etc. all fall back to **hardcoded literal values** baked into the source when the env var is absent — so a misconfigured deploy doesn't fail, it silently serves the wrong (possibly stale, possibly a different environment's) config.

**Rule of thumb:** every entry in `serverEnv`/`clientEnv` comes from a Zod schema parsed once at module load; no `!` assertions, no literal fallback values for anything that is actually configuration (a `.default()` in the schema is fine for genuinely optional values — a hardcoded production Auth0 domain as a "fallback" is not).

---

## 9. Test the Runtime You Actually Deploy To

**Principle:** Invariant 6 (edge runtime only, no Node-only APIs) is currently enforced by code review and eslint, not by anything that runs. Cloudflare's own recommended integration — `@cloudflare/vitest-pool-workers` — runs tests inside the real `workerd` runtime, so a test using a Node-only API fails the same way production would, not just in review.

**Exemplar (missing):** no test runner is configured in this repo today (no `vitest`/`jest` dependency, no test script, no `*.test.ts` files). Standard setup: `vitest` + `@cloudflare/vitest-pool-workers`, `cloudflareTest()` in `vitest.config.ts`, `npm run test` added to `package.json`.

**Rule of thumb:** start at the service/verifier layer (pattern 7) — those are plain functions with a clear input/output contract and are where the highest-value bugs live (ownership checks, the error-contract arms in pattern 3). Route through the same middleware chain as production so a test's pass/fail reflects what actually ships, not a mocked approximation of it.
