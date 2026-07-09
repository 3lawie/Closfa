# DESIGN PATTERNS

This document details the architectural decisions and patterns used in the Closfa App. It ensures code consistency and a high level of professional design. Each pattern names its **exemplar file** — when writing new code, mirror the exemplar, not memory.

> Enforcement: these patterns are checked by the `.claude` reviewer agents (`/full-review`) and referenced by the `/patterns` skill. When code and this document disagree, fix one of them — never let them drift silently.

## 1. Authentication Architecture (BFF Pattern)
We use a **Backend-for-Frontend (BFF)** pattern for authentication. Exemplar: `src/server/actions/ThirdParty/OAuth/auth0.service.ts`, `src/server/lib/session.ts`.
- **No SPA tokens**: The client browser never receives JWT access tokens.
- **Encrypted Session**: Once authenticated, the server encrypts the session payload using `jose` (JWE) and sends an `HttpOnly`, `SameSite=Lax` cookie.
- **Reduced XSS blast radius**: Tokens never reach the client, so script injection cannot steal them. (XSS itself is still mitigated separately — React escaping, no `dangerouslySetInnerHTML` with user content.)

## 2. Sliding Window Session Management
Exemplar: `src/server/lib/session.ts`.
- **Threshold Renewal**: Sessions renew automatically when passing a 25% expiration threshold to avoid abrupt logouts.
- **Absolute Expiration Cap**: For security, no session can live indefinitely. A 30-day absolute cap (`issuedAt` timestamp tracking) forces re-authentication.
- **Decrypt once per request**: the JWE is decrypted exactly once, by the middleware chain — see README Rule 1.

## 3. ServerResult Pattern (Result Unions)
Exemplar: `src/server/lib/result.ts`, consumed by verifiers in `src/server/actions/Database/verifiers/`.

Instead of throwing generic errors that the frontend must blindly catch, we use a structured `ServerResult<T>` union type.
```typescript
type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string; issues?: ZodIssue[] }
```
This forces the developer to handle both success and failure cases explicitly in the UI without relying on hidden `try/catch` blocks.

**Rule of thumb:** *expected* failures (not found, forbidden, invalid input) return `{ ok: false, ... }`; `throw` is reserved for unexpected/infrastructure failures (DB down, crypto error).

> ⚠️ Known drift: some services (e.g. `post.service.ts`) still `throw new Error(...)` for expected cases. The pattern stands; the code must catch up. Do not copy the throwing style into new services.

## 4. Input Validation (Zod)
Exemplar: `src/verification/post.validation.ts`.

Every `createServerFn` must implement an `.inputValidator(schema)` using Zod. Schemas are centralized inside **`src/verification/`** so they can be shared between server actions and client-side forms.

**Corollary:** a handler that reads `data as any` is a rule violation — the validated type should flow from the Zod schema (`z.infer`).

> ⚠️ Known drift: `post.service.ts` handlers currently use `data as any` with no validator. Fixing these is the reference exercise for the `/teach` skill.

## 5. Defense in Depth
- **The middleware chain is the security boundary** (`src/server/lib/middleware.ts`): route `beforeLoad` guards only protect navigation; every protected server function must carry `authMiddleware`.
- **CSRF**: Strict `Origin` and `Host` validation middleware before protected server functions execute.
- **Rate Limiting**: Implementation via Upstash Redis (`@upstash/ratelimit`, `src/server/lib/rateLimiter.ts`). Anonymous users are tracked via a composite `IP + User-Agent` key to resist trivial proxy-hopping.
- **Turnstile**: Sensitive forms implement Cloudflare Turnstile (`src/server/lib/turnstile.ts`) to verify genuine human interaction before processing data.
- **Ownership checks**: writes on user-owned rows go through pure verifiers (`verifyIsOwner` in `src/server/actions/Database/verifiers/auth.ts`) using the **session's** userId — never an id supplied by the client payload.

## 6. Drizzle ORM Standards
Exemplar: README Rule 2 code samples; schema in `src/server/db/schema.ts`.
- **Reads (`db.query`)**: Prefer object syntax for relation-heavy reads (`findFirst({ where: ... })`).
- **Writes (`db.update/delete`)**: Always use explicit operator syntax (`eq()`, `and()`) to prevent destructive accidents.
- **Batching**: never loop awaited single-row queries (N+1); use batch `insert(...).values([...])` and `inArray()`.

## 7. Layered Server Structure
New server features follow the service / verifier / validation triangle:

| Piece | Location | Responsibility |
| :--- | :--- | :--- |
| Service (server functions) | `src/server/actions/Database/services/` | Business logic + DB access |
| Verifier (pure authz) | `src/server/actions/Database/verifiers/` | Ownership/permission checks; receives `session` as a parameter |
| Validation (Zod schema) | `src/verification/` | Input shape, shared with client forms |

Routes and components never query the database directly, and nothing under `src/components/` or `src/lib/` imports from `src/server/` (env leakage + bundle bloat).
