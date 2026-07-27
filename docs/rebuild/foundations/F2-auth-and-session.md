# F2 — Auth & Session

How a request proves who it is, without ever handing the browser a token. This is security-critical: read the rules, and when you rebuild it, mirror the shapes exactly — this is the one area where "close enough" is a vulnerability.

## The one-sentence model

**Auth0 verifies the human; the server mints an encrypted cookie; the browser only ever holds that cookie.** Tokens (Auth0 access/id tokens) never reach client JavaScript — that's the Backend-for-Frontend (BFF) pattern, and it's why an XSS bug can't steal a session token here.

## 1. The login round-trip (Authorization Code + PKCE)

```
/api/auth/login ──302──▶ Auth0 /authorize ──▶ user logs in ──302──▶ /api/auth/callback
        │                                                                   │
   sets auth0_state cookie {state, codeVerifier, returnTo}          exchange code→tokens
                                                                    getUserInfo→upsert→createSession
                                                                            └─302─▶ /onboarding or returnTo
```

**Rules:**
- **PKCE, server-side.** Generate a `codeVerifier` + `codeChallenge` (WebCrypto, base64url) at login; store the verifier in a short-lived `HttpOnly` `auth0_state` cookie alongside a random `state` and the `returnTo`. On callback, the returned `state` must equal the stored one or you reject — that's the CSRF defense for the login leg.
- **The callback is the only place a session is born.** `processAuthCallback(code, state)` orchestrates: `exchangeCodeForToken` → `getUserInfo` → `validateAndNormalizeUserInfo` → `upsertAuthUser` → `createSession` → redirect. Routes call *this*, never the raw Auth0 primitives.
- **New users get a null nickname** and are redirected to `/onboarding`; an email-shaped `name` is normalized to `"New user"`.

```ts
// callback leg — state compare is the CSRF gate:
if (stored.state !== returnedState) throw new Error('State mismatch — possible CSRF')
const returnTo = sanitizeReturnTo(stored.returnTo ?? null)  // open-redirect guard
```

> **Answer key:** `ai:src/server/actions/ThirdParty/OAuth/auth0.ts` (PKCE primitives), `ai:src/server/actions/ThirdParty/OAuth/auth0.service.ts` (`processAuthCallback`), `ai:src/routes/api/auth/{login,callback,logout}.ts`.
> **Watch-out:** these Auth0 functions **throw** on failure (the route handler catches and returns a generic 500 — never leak a stack trace to the client; that was `security#4`). This is the deliberate exception to the [F3] `ServerResult` rule: third-party-integration primitives throw; business logic returns results.

### The open-redirect guard is a pure function
`returnTo` is attacker-influenced, so it's sanitized by a framework-free, unit-tested function. Copy its order exactly — a control-char bypass here was a real caught bug.

```ts
export function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw) return null
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null   // control chars FIRST (WHATWG strips tab/CR/LF)
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  try { new URL(raw); return null } catch { return raw }      // parseable = absolute = reject
}
```
> **Answer key:** `ai:src/server/actions/ThirdParty/OAuth/auth0.rules.ts` (+ `auth0.returnTo.test.ts`).

## 2. The session cookie (JWE)

**Rule — the payload is encrypted, not just signed.** A signed JWT is readable by anyone; this app encrypts with `jose` so the browser can't read *or* forge it.

- Algorithm: `PBES2-HS256+A128KW` (key-wrap from `SESSION_SECRET`) + `A256GCM` (AES-256-GCM content). Works on Workers because `jose` uses WebCrypto.
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` **in production only** (localhost has no HTTPS).
- The payload (`SessionData`) is a Zod object: `userId`, `sub`, `email`, `name`, `nickname`, `issuedAt`, `expiresAt`.

```ts
const token = await new EncryptJWT(fullSessionData)
  .setProtectedHeader({ alg: 'PBES2-HS256+A128KW', enc: 'A256GCM' })
  .setIssuedAt(issuedAt).setExpirationTime(expiresAt)
  .encrypt(getSecretKey())
setResponseHeader('Set-Cookie', buildCookieString(COOKIE_NAME, token, SESSION_DURATION_SECONDS))
```

### Minting is server-only — no RPC surface (security#1)
**Rule — `createSession`/`destroySession` must be `createServerOnlyFn`, not `createServerFn`.** A `createServerFn` mints an HTTP RPC endpoint; if session-minting had one, anyone could POST a chosen `userId` and receive a valid cookie (full account takeover). `createServerOnlyFn` strips it from the client bundle and throws if called client-side. Only the Auth0 callback, the sliding-window renewal, and the nickname-claim may call it.

### Sliding window + absolute cap
The expiry decision is a **pure function** (`evaluateSessionPayload`), so it's unit-tested away from the crypto:

```ts
// session.rules.ts constants: 7-day duration, 30-day absolute cap, renew past 25% elapsed
export function evaluateSessionPayload(s, now): 'valid' | 'renew' | 'expired' {
  if (now - s.issuedAt >= ABSOLUTE_CAP_SECONDS) return 'expired'   // hard 30-day wall
  if (now >= s.expiresAt) return 'expired'
  if (s.expiresAt - now <= SESSION_DURATION_SECONDS * 0.75) return 'renew'
  return 'valid'
}
```
On `'renew'`, `getSession` silently re-mints with the *original* `issuedAt` (so the absolute cap still bites) and sets an `X-Session-Status: renewed` header.

> **Answer key:** `ai:src/server/lib/session.ts`, `ai:src/server/lib/session.rules.ts` (+ tests).

### Only three fields ever reach the client
**Rule — never ship `email`/`sub`/`issuedAt` to the browser.** A route loader that returns session data serializes it into the SSR HTML. Send only what the UI needs ("whose post is this", "what's my name"):

```ts
export type PublicSessionData = Pick<SessionData, 'userId' | 'name' | 'nickname'>
export function toPublicSession(s: SessionData | null): PublicSessionData | null { /* pick 3 */ }
```

## 3. The middleware chain — the *only* real boundary (invariant #1)

> Route `beforeLoad` guards protect **navigation**, not data. An attacker POSTs a `createServerFn` endpoint directly, bypassing every route guard. So authorization lives in middleware, on the server function.

**Rule — decrypt once per request.** `sessionMiddleware` is the *only* place `getSession()` runs in a server-fn chain; `auth`/`optionalAuth`/`rateLimiter` all depend on it and read its output. TanStack dedupes a middleware shared across dependency arrays, so `[authMiddleware, rateLimiterMiddleWare]` still decrypts once.

```ts
// sessionMiddleware provides sessionResult — NOT session — on purpose:
return next({ context: { sessionResult: result } })
```
**Why `sessionResult`, not `session`?** Context types merge in array order. If `sessionMiddleware` claimed the `session` key, a chain like `[auth, rateLimiter]` would re-widen the auth-narrowed `session: SessionData` back to `SessionData | null` in every handler. Providing `sessionResult` and letting `authMiddleware` be the one to narrow `session` keeps handlers correctly typed.

```ts
export const authMiddleware = createMiddleware().middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    const { session, status } = context.sessionResult
    if (!session || status === 'expired' || status === 'unauthorized')
      throw new Error('Unauthorized — please log in')
    enforceCsrfOrigin()                          // (2)
    // (3) ban is a LIVE read every request — a ban must bite on the next call,
    // not wait for the cookie to expire:
    const [u] = await db.select({ isBanned: user.isBanned })
      .from(user).where(eq(user.userId, session.userId)).limit(1)
    if (u?.isBanned) throw new Error('Account suspended')
    return next({ context: { session } })        // narrowed non-null for handlers
  })
```

Three things every authed call enforces, in order:
1. **Authenticated** — a valid, non-expired session exists.
2. **CSRF** — for non-GET/HEAD, the request `Origin`'s host must equal the `Host` header; in production a missing `Origin` on a state-changing request is rejected outright.
3. **Not banned** — a live `isBanned` read (never session-cached), same tradeoff role checks make.

`optionalAuthMiddleware` is the same minus the login requirement (guests get `session: null`) but *still* enforces CSRF — that's what public reads (feed, search, post detail) carry, alongside `rateLimiterMiddleWare` ([F3]).

> **Answer key:** `ai:src/server/lib/middleware.ts`.
> **Watch-out:** `rateLimiterMiddleWare` (capital W) is the default-tier export; `rateLimiterMiddlewareFor(tier)` is the factory for stricter tiers — see [F3].

## 4. How routes consume it (the guard shape)

The whole tree decrypts once in `__root.tsx` `beforeLoad`, puts the *public* subset on router context, and children read context — never re-fetch.

```ts
// _authenticated.tsx — the UI auth gate (cosmetic; real enforcement is middleware above)
beforeLoad: ({ context }) => {
  const { session, sessionStatus } = context           // decrypted once by root
  if (!session || sessionStatus === 'expired' || sessionStatus === 'unauthorized')
    throw redirect({ href: '/api/auth/login' })
  if (!session.nickname) throw redirect({ href: '/onboarding' })
  return { session }
}
```

> **Answer key:** `ai:src/routes/__root.tsx`, `ai:src/routes/_authenticated.tsx`.
> **Watch-out:** `ai:src/routes/api/auth/mock-login.ts` mints a hardcoded session for local dev and **404s in production** (`process.env.NODE_ENV === 'production'` guard). Keep that guard if you port it.

---

**Next:** [F3] Server Contract — now that a request is authenticated, how is a server function shaped, validated, and how does it report failure.
