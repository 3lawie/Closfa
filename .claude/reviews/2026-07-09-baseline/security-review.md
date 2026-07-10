# Security Review — Closfa (defensive, whole-codebase)

Reviewed against the security-reviewer checklist, README Rules 1–3, and DESIGN_PATTERNS §1–7. Scope covered: all `createServerFn` in `src/server/actions/**`, `session.ts`, `middleware.ts`, `src/routes/api/auth/*`, ImageKit signing, `client-env.ts`, rate-limiting coverage, `wrangler.jsonc`, `.env.example`.

## BLOCKERS (exploitable)

**1. `src/server/lib/session.ts:172` — `createSession` is a public, un-middlewared `createServerFn({ method: 'POST' })` that mints a session for any client-supplied `userId`.**
Attack: an attacker POSTs to the generated RPC endpoint with `{ data: { sessionData: { userId: "<victim>", sub, email, name, nickname } } }`; the server encrypts it with `SESSION_SECRET` and returns a valid `Set-Cookie: closfa_session=...`, giving the attacker a fully-valid session impersonating any user — complete authentication bypass / account takeover. This is exactly the "attacker POSTs directly to a server function" case the app's own threat model calls the real boundary, and this function has no `authMiddleware` and no CSRF/Origin check.
Fix: `createSession` must not be a `createServerFn`. Convert it to a plain server-only `async function createSession(...)` (no RPC surface) called only from `processAuthCallback`, the renewal path in `getSession`, and `claimNicknameFn`. Same treatment for the internal cookie write in `destroySession` (see below).

## SHOULD FIX (defense-in-depth gaps)

**2. `src/server/actions/ThirdParty/ImageKit/imagekit.service.ts:31 & 53` — both ImageKit signing endpoints (`getImageKitAuth`, `getImageKitAuthValidated`) have no `authMiddleware` and no rate limit.**
Attack: an unauthenticated visitor calls the endpoint, receives a 40-minute HMAC upload token, and uses Closfa's ImageKit account as free/abusive file storage; the plain `getImageKitAuth` variant applies zero type/size constraints. Note also that the ImageKit signature is bound only to `token+expire`, not to the file, so the "validated" variant's checks are advisory — the client can validate one small image then upload anything within 40 min.
Fix: add `.middleware([authMiddleware, rateLimiterMiddleWare])` to both; drop the unconstrained `getImageKitAuth` (or make it also run `verifyImageKitUpload`); document that server-side size/type is best-effort given ImageKit's token model, and enforce hard limits via ImageKit dashboard upload policies.

**3. `src/server/actions/Database/services/moderation.service.ts:8` — `assignModerator` reads `role` from `data as any` with no validation and no level ceiling.**
Attack: a `co_owner` (the only tier that passes `canAssignModerator`) assigns `role: 'co_owner'` to arbitrary `targetUserId`, minting more co-owners at their own level; there is also no dedup and no check that the assigner outranks the granted role. Lateral privilege escalation within a profile's mod team.
Fix: validate `role` against `profileRoleEnum` with a Zod schema, and require the granted role's level to be strictly below the assigner's (`perm.level > ROLE_LEVELS[role]`).

**4. `src/routes/api/auth/login.ts:16` — the login route returns `error.message` and `error.stack` in the HTTP 500 body.**
Attack: forcing an error (e.g. misconfigured env) leaks stack traces and internal file paths to any visitor, aiding recon. Fix: log server-side only; return a generic `Response('Login failed', { status: 500 })` (the callback route at `callback.ts:34` already does this correctly).

**5. `src/server/actions/Database/services/post.service.ts:27` & `comment.service.ts:20` — client-supplied `mediaIds` / `media_id` are linked with no ownership check.**
Attack: a user submits another user's `mediaId` in `createPost`/`createComment`, attaching media they don't own to their own content (IDOR on the media table). Fix: before inserting into `postToMedia`/setting `comment.media_id`, verify each media row's owner equals `context.session.userId`.

**6. `src/server/lib/turnstile.ts:8` — `verifyTurnstileToken` is defined but has no caller anywhere in the codebase, and returns `true` when `TURNSTILE_SECRET_KEY` is unset.**
DESIGN_PATTERNS §5 claims "Sensitive forms implement Cloudflare Turnstile," but no server function invokes it, so abuse-prone flows (login, create, follow) have zero human-verification. Fix: wire it into the abuse-prone server functions and fail-closed in production (only bypass on `NODE_ENV !== 'production'`).

**7. Rate-limiting coverage is nearly absent.** Only `getFeedFn` (`feed.service.ts:19`) carries `rateLimiterMiddleWare`. No limiter on `/api/auth/login`, `/api/auth/callback`, `createPost`, `createComment`, `followUser`, `reportContent`, `assignModerator`, `claimNicknameFn`, `getFollowingFeedFn`, or the ImageKit endpoints. Attack: unthrottled credential/callback hammering, comment/follow/report spam. Fix: add `rateLimiterMiddleWare` (ideally per-tier) to state-changing and auth endpoints; the raw `api/auth/*` routes need a manual `checkRateLimit()` call since the middleware chain doesn't apply to route handlers.

## CONSIDER (hardening)

- **`src/server/lib/session.ts:213` `destroySession`** — un-middlewared POST server fn with no Origin check; a cross-site request can force-logout a user (CSRF logout, low impact). Fold cookie-clearing into a plain server function like createSession, or add the Origin check.
- **`src/server/lib/middleware.ts:19` + `rateLimiter.ts:23`** — `getFeedFn` runs `[authMiddleware, rateLimiterMiddleWare]`, and each calls `getSession()`, decrypting the JWE twice per request, violating README Rule 1's "decrypt once." Have `checkRateLimit` accept the session from context instead of re-fetching.
- **`src/server/lib/session.ts:85` `getSecretKey`** — zero-pads short `SESSION_SECRET` to 32 bytes and truncates long ones; a short secret silently yields low-entropy key material. Enforce a minimum length (e.g. throw if `< 32` bytes).
- **`src/server/actions/Database/services/user.service.ts:43` `updateProfile`** — no Zod validation (`data as any`, documented drift); `website` is stored unsanitized and, if later rendered as an `href`, a `javascript:` value becomes stored XSS. Add the profile Zod schema (one exists at `src/verification/profile.validation.ts`) and constrain `website` to `http(s)` URLs.
- **`.env.example`** — uses `NEXT_PUBLIC_*` prefixes while `client-env.ts` reads `VITE_PUBLIC_*`, and omits `SESSION_SECRET`, `AUTH0_CLIENT_SECRET`, `AUTH0_DOMAIN`, `UPSTASH_REDIS_*`, `TURNSTILE_SECRET_KEY`. Align the prefix and list all required secrets so a fresh deploy doesn't silently run with `getSecretKey`/Turnstile disabled.
- **`src/server/actions/ThirdParty/OAuth/auth0.ts:151,262` `getCallbackUrl`/logout** — `redirect_uri`/`returnTo` are derived from the request `Host`/origin. This is safe only because Auth0's dashboard allow-list rejects mismatches; keep that allow-list tight (no wildcards) since it is the sole guard against Host-header redirect manipulation.

## Invariants verified SOLID (confirmed-good)

- **BFF / no client tokens** — Auth0 `access_token`/`id_token` never leave the server; `processAuthCallback` (`auth0.service.ts:15`) exchanges server-to-server and returns only a hardcoded `/onboarding` or `/` redirect, so there is **no open-redirect** in the callback.
- **PKCE + state CSRF** — `auth0.ts` generates a real `code_verifier` (32 random bytes, S256 challenge) and a random `state`, stores both in a 10-min HttpOnly `SameSite=Lax` cookie, and `exchangeCodeForToken:204-210` rejects a missing or mismatched state before the token call. Solid.
- **Session cookie flags** — `buildCookieString` (`session.ts:222`) always sets `HttpOnly`, `SameSite=Lax`, and `Secure` in production; both the session and the auth0_state cookies are consistent.
- **Absolute 30-day cap + sliding renewal** — enforced at `session.ts:136` and cannot be bypassed by the client (timestamps live inside the encrypted, integrity-tagged JWE via A256GCM).
- **CSRF Origin/Host check** — `authMiddleware` and `optionalAuthMiddleware` validate `origin.host === host` on every non-GET and fail-closed on a missing Origin in production. Correct — the gaps are only the un-middlewared server fns listed above.
- **Ownership via session userId (no client-id trust)** — `deletePost` (`post.service.ts:54`, `verifyIsOwner` against `post.author_id`), `deleteComment` (owner-or-mod via `getProfilePermission`), `followUser`/`unfollowUser`, `updateProfile`, and `claimNicknameFn` all scope writes by `context.session.userId`, never a client id. `verifyIsOwner` (`auth.ts:11`) is a correct pure check. No IDOR on these write paths.
- **No secrets client-side** — `client-env.ts` contains only genuinely public values (ImageKit *public* key, Auth0 domain + SPA client id, ImageKit URL endpoint). `serverEnv` (private key, client secret, `SESSION_SECRET`) is confined to server files and, per grep, is never imported from `src/components/**` or `src/lib/**`.
- **No SQL injection / XSS sink** — the only `sql\`\`` usages are Drizzle `check()` constraints referencing columns (no user input); all reads in `queries.ts` are parameterized relational queries (the `cursor` in `getFollowingFeed` is split and passed as bound values, not concatenated). No `dangerouslySetInnerHTML` anywhere.
- **`wrangler.jsonc`** — clean; contains no plaintext secrets (secrets come from wrangler secrets / `.dev.vars`), and `.gitignore` correctly excludes `.env`, `.env.*`, and `.dev.vars`.

Top priority: fix finding #1 (createSession RPC exposure) before anything else — it is a full authentication bypass and undermines every ownership check above.
