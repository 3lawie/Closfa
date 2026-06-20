# DESIGN PATTERNS

This document details the architectural decisions and patterns used in the Closfa App. It ensures code consistency and a high-level of professional design.

## 1. Authentication Architecture (BFF Pattern)
We use a **Backend-for-Frontend (BFF)** pattern for authentication.
- **No SPA tokens**: The client browser never receives JWT access tokens.
- **Encrypted Session**: Once authenticated, the server encrypts the session payload using `jose` (JWE) and sends an `HttpOnly`, `SameSite=Lax` cookie.
- **Zero XSS Risk**: By keeping tokens on the server, we completely eliminate token theft via XSS.

## 2. Sliding Window Session Management
- **Threshold Renewal**: Sessions renew automatically when passing a 25% expiration threshold to avoid abrupt logouts.
- **Absolute Expiration Cap**: For security, no session can live indefinitely. A 30-day absolute cap (`issuedAt` timestamp tracking) forces re-authentication.

## 3. ServerResult Pattern (Result Unions)
Instead of throwing generic errors that the frontend must blindly catch, we use a structured `ServerResult<T>` union type.
```typescript
type ServerResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string; issues?: ZodIssue[] }
```
This forces the developer to handle both success and failure cases explicitly in the UI without relying on hidden `try/catch` blocks.

## 4. Input Validation (Zod)
Every `createServerFn` must implement an `.inputValidator(schema)` using Zod.
We centralize schemas inside `src/schemas` to allow sharing them between server actions and client-side forms (like React Hook Form).

## 5. Defense in Depth
- **CSRF**: Strict `Origin` and `Host` validation middleware before protected server functions execute.
- **Rate Limiting**: Implementation via Upstash Redis (`@upstash/ratelimit`). Anonymous users are tracked via a composite `IP + User-Agent` key to resist trivial proxy-hopping.
- **Turnstile**: Sensitive forms implement Cloudflare Turnstile to verify genuine human interaction before processing data.

## 6. Drizzle ORM Standards
- **Reads (`db.query`)**: Prefer object syntax for relation-heavy reads (`findFirst({ where: ... })`).
- **Writes (`db.update/delete`)**: Always use explicit operator syntax (`eq()`, `and()`) to prevent destructive accidents.
