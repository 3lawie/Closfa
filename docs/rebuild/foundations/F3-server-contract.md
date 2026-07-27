# F3 — Server Contract

The shape every server function shares: how it's layered, validated, authorized, rate-limited, and how it reports failure. Learn this once and every service in [P1]–[P6] is a variation on it.

## 1. The layered triangle

Three layers, each with one job. Routes/components never touch persistence directly.

| Layer | Location | Job |
|---|---|---|
| **Service** (server fns) | `src/server/actions/Database/services/*.service.ts` | business logic + DB access |
| **Verifier** (pure auth) | `src/server/actions/Database/verifiers/` | ownership/permission checks; receives `session` as a parameter |
| **Validation** (Zod) | `src/verification/*.ts` | input shape, shared with client forms |

**Boundary rule:** nothing under `src/components/` or `src/lib/` imports from `src/server/`. That keeps server-only code (DB, secrets) out of the client bundle.

## 2. The canonical server function

Every server function is built in the same order — memorize this spine:

```ts
export const createComment = createServerFn({ method: 'POST' })  // 1. method
  .middleware([authMiddleware, rateLimiterMiddleWare])           // 2. auth + limit ([F2])
  .inputValidator(createCommentValidation)                        // 3. Zod ([§3])
  .handler(async ({ data, context }): Promise<ServerResult<{ commentId: string }>> => {
    const { userId } = context.session                            // 4. identity from context
    // …business logic; ownership via a verifier; DB via the two-API rule ([F1])…
    return ok({ commentId })                                      // 5. structured result ([§4])
  })
```

- **Method** — `GET` for reads, `POST` for anything that changes state (also what CSRF keys off, [F2]).
- **Middleware** — `[authMiddleware, rateLimiterMiddleWare]` is the default. Public reads use `[optionalAuthMiddleware, rateLimiterMiddleWare]`. A stricter limit uses the factory: `rateLimiterMiddlewareFor('roleRedeem')` ([§5]).
- **Identity comes from `context.session`, never from `data`.** The client can put any `userId` in the body; you use the one the middleware decrypted.

## 3. Validation triangle — every input, one schema (invariant #3)

**Rule — every `createServerFn` has `.inputValidator(schema)` with a Zod schema from `src/verification/`; the *same* schema types the client form.** A handler that reads `data as any` is a violation — the type flows from `z.infer`.

```ts
// src/verification/comment.validation.ts — the single source of truth
export const createCommentValidation = z.object({
  postId: z.string().min(1),
  comment: z.string().min(1).max(1000),
  type: z.enum(['text', 'sticker']),
  mediaId: z.string().optional(),
})
export type CreateCommentInput = z.infer<typeof createCommentValidation>
```

The client form imports the *same* schema, so client and server can never disagree on shape. Validation failure returns a structured result carrying the Zod issues (wire-safe: only `path` + `message`, never the raw input).

> **Answer key:** `ai:src/verification/*.ts`.
> **Watch-out — a real drift to avoid.** `post.validation.ts` (`createPostValidation`) is **not** the schema `createPostWithMedia` actually uses — that service defines its own inline `createPostInput`. They've diverged. When you rebuild create-post ([P3]), unify them; don't inherit the split.

## 4. The error contract — `ServerResult` (invariant #4)

**Rule — *expected* failures are values; only *infrastructure* faults throw.** Not-found, forbidden, invalid-input → return `{ ok: false, … }`. DB down, crypto error → throw. This forces the UI to handle both arms explicitly instead of a blind `try/catch`.

```ts
// src/server/lib/result.ts
export type ServerResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: ErrorCode; message: string; issues?: ValidationIssue[] }
export const ok  = <T>(data: T): ServerResult<T> => ({ ok: true, data })
export const err = (error: ErrorCode, message: string, issues?): ServerResult<never> => ({ ok: false, error, message, ...(issues && { issues }) })
```

`ErrorCode` = `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | BAD_REQUEST | INTERNAL_ERROR | RATE_LIMITED`. Use the `ok()`/`err()` constructors, not hand-written literals, so the discriminant stays `true`/`false` (not widened to `boolean`).

The house style for a service body: wrap the work, swallow the infra error, log it, and return `err('INTERNAL_ERROR', …)` rather than letting a throw escape into the RPC layer:

```ts
try { /* … */ return ok(data) }
catch (e) { logger.error('createComment failed', { userId }, e); return err('INTERNAL_ERROR', 'Could not post comment') }
```

> **Answer key:** `ai:src/server/lib/result.ts` (+ `result.test.ts`).
> **Watch-out — two drifts.** (1) `savedPost.service.ts` hand-rolls `{ ok: true as const, data }` instead of `ok()/err()` — the least-conformed service; rebuild it with the constructors. (2) GET list endpoints (`getMyPostsFn`, `getSavedPostsFn`, `getMutedKeywordsFn`, …) return the **raw query result**, not a `ServerResult` — that's an accepted convention for loader-shaped reads, but be deliberate about which reads wrap and which don't.

## 5. Authorization is a pure function (invariant #5)

**Rule — ownership/permission checks receive the `session` (or `userId`) as a parameter and return a decision; they never read the cookie themselves, and ownership is verified before a write — never trusted from a client-supplied id.**

Two RBAC ladders live in `verifiers/permissions.ts`, both **live DB reads** (never session-cached, so a demotion bites immediately):

```ts
// profile-scoped: moderator(1) < vip_moderator(2) < co_owner(3) < owner(4 implicit)
const perm = await getProfilePermission(userId, profileId)
if (!perm.authorized || !perm.canDeleteComment) return err('FORBIDDEN', '…')
// site-wide: moderator(1) < senior_moderator(2) < admin(3) < owner(4)
const g = await getGlobalPermission(userId)
```

**The escalation guard** (used on every role grant/removal): you cannot assign or remove a role at or above your own level.

```ts
if (perm.level <= ROLE_LEVELS[role]) return err('FORBIDDEN', 'cannot assign a role >= your own')
```

> **Answer key:** `ai:src/server/actions/Database/verifiers/permissions.ts`. Ownership helper pattern in `verifyIsOwner`. See [P5] for the full role story.

## 6. Rate limiting — tiers, one decrypt

Upstash Redis sliding-window, consuming the session the middleware already decrypted ([F2]) — it does **not** re-decrypt.

```ts
// rateLimiter.rules.ts tiers:  default 30/10s · auth 10/60s · roleRedeem 5/60s
// identifier: `user:${id}` when logged in, else `anon:${cf-connecting-ip}:${ua}`
```

**Rule — anonymous callers are keyed by IP + User-Agent**, so trivial proxy-hopping doesn't reset the limit. Limiter instances are lazily created per tier (nothing runs at module-eval on Workers). Exceeding throws (surfaces as a server error) — the abuse surface (auth, create/comment/follow/report, nickname claim, ImageKit, role redeem) is all covered, and Turnstile fails **closed** in production on abuse-prone forms.

> **Answer key:** `ai:src/server/lib/rateLimiter.ts` + `rateLimiter.rules.ts`, `ai:src/server/lib/turnstile.ts`.

## 7. The idempotent toggle (the most-reused write)

Like, save, block, comment-like, reply-like are all this exact shape. There are **no transactions** ([F1]), so it's written so the worst interleaving is a harmless counter re-read, not corruption:

```ts
// 1. try to REMOVE first (unlike):
const removed = await db.delete(postLike)
  .where(and(eq(postLike.postId, postId), eq(postLike.userId, userId))).returning({ id: postLike.id })
if (removed.length) {                                   // was liked → now unliked
  await db.update(post).set({ likes: sql`GREATEST(${post.likes} - 1, 0)` }).where(eq(post.postId, postId))
  return ok({ liked: false })
}
// 2. else ADD (like), idempotently:
await db.insert(postLike).values({ postId, userId }).onConflictDoNothing()
await db.update(post).set({ likes: sql`${post.likes} + 1` }).where(eq(post.postId, postId))
// notify the author ([§8]); return ok({ liked: true })
```

**Rules:** the `unique(target_id, user_id)` makes the API safe to call twice; `onConflictDoNothing()` absorbs the race; `GREATEST(c-1,0)` keeps the denormalized counter from ever going negative.

> **Answer key:** `ai:src/server/actions/Database/services/like.service.ts` (the reference), reused in `savedPost`, `block`, `comment` like toggles.
> **Watch-out:** `like`/`savedPost` currently log with raw `console.error` — use `logger` ([§9]) when you rebuild them.

## 8. Fan-out runs after the response (`waitUntil`)

**Rule — side effects that the caller doesn't need to wait for (notifications, search enrichment, mention parsing) are handed to `waitUntil` so they don't block the response and aren't killed by the edge.**

```ts
import { waitUntil } from 'cloudflare:workers'
// inside createPostWithMedia, after the row is written:
if (content) waitUntil(notifyMentions(content, userId, postId))
waitUntil(enrichPostForSearch(postId))                 // Whisper/RAKE, [F5]
```

Notifications go through one writer that skips self-notify, honors per-type opt-out, and coalesces unread same-type rows ("and 3 others liked your post") — see [F5]/[P6]. `createNotification` never throws, so a failed notification can't break the action that triggered it.

## 9. Logging is structured and edge-safe

One JSON line per call, level-thresholded lazily (Workers populate `process.env` per request):

```ts
logger.error('createComment failed', { postId, userId }, err)  // expands errName/errMessage/errStack
```

**Rule — use `logger`, never `console.*`, in services** (so logs are machine-parseable and consistently shaped). The two exceptions in the AI branch (`like`, `savedPost`) are drift to fix, not precedent.

> **Answer key:** `ai:src/server/lib/logger.ts`.

---

**Next:** the foundations are complete. Move to the feature pages — start with [P1] Feed & Home, the surface that reads the most and mutates the least, then [P2] Post & Comments where these write patterns all come together.
