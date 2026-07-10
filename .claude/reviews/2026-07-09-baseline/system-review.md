# System-Reviewer Findings — Closfa whole-project audit

## Blockers

**`src/server/actions/Database/services/feed.service.ts:18-19` — the "For You" public feed is gated by `authMiddleware`.**
The handler doc and `routes/index.tsx:27` both advertise this as the public, no-auth feed, but `authMiddleware` throws `Unauthorized` when there is no session. On the home page the loader swallows it (`.catch(() => null)`), so **every logged-out visitor gets an empty feed** — the core content of the app never renders for guests, and `FeedList`'s `forYouQuery` fails on every guest client fetch too. Fix: swap to `.middleware([optionalAuthMiddleware, rateLimiterMiddleWare])` and read `context.session?.userId` for the rate key.

**JWE session is decrypted 2-3× per request — violates README Rule 1 / DESIGN_PATTERNS §2.** `rateLimiter.ts:23` `checkRateLimit()` calls `getSession()` independently of `authMiddleware` (`middleware.ts:29`). Any server fn carrying both middlewares — e.g. `getFeedFn` with `[authMiddleware, rateLimiterMiddleWare]` — decrypts the cookie twice. On top of that, route `beforeLoad` (`_authenticated.tsx:6`) and each child loader (`dashboard.tsx:8`, `create.tsx:9`) each call `getSession()` again, so a single authenticated navigation performs 3-4 independent PBES2+AES decryptions. Fix: the rate limiter must accept the already-decrypted session as a parameter (called from within the handler that holds `context.session`), and route loaders must consume the session from `beforeLoad` via router context instead of re-calling `getSession()`.

## Should fix

**`src/server/queries.ts:73-86` (`getFeed`) — the single hottest query has no supporting index.** It filters `is_published = true AND published_at > (now-30d)` and orders by `desc(likes), desc(published_at)`. Schema (`schema.ts:145-150`) has only `post_published_at_index` on `published_at` alone and no index on `likes` or `is_published`; Postgres will seq-scan + sort the whole `post` table as it grows. Fix: add a composite/partial index e.g. `index().on(likes.desc, published_at.desc).where(is_published)`. Additionally this path uses OFFSET pagination (`offset = (page-1)*limit`), which degrades linearly on deep scroll — inconsistent with the keyset cursor used by `getFollowingFeed`.

**`src/server/queries.ts:95-133` (`getFollowingFeed`) — no index matches the query shape.** Filters `author_id IN (...) AND is_published` and orders by `(published_at, postId)`. The only author index is `post_author_index` on `(author_id, post_status)` — wrong trailing column. Add `(author_id, published_at, post_id)` to serve both the IN-filter and the compound-cursor ordering.

**Validation boundary is absent across the write surface — violates README Rule 3 / §4.** `post.service.ts:11`, `comment.service.ts:12`, `follow.service.ts:11`, `moderation.service.ts:12&44`, `user.service.ts:46 (updateProfile)`, and `imagekit.service.ts:55` all take `data as any` with **no `.inputValidator`**. `getFeedFn`'s validator (`feed.service.ts:20`) is a passthrough `(data?) => data`, not a Zod schema. Unvalidated client JSON flows straight into `db.insert/update`. Zod schemas already exist in `src/verification/` and `entities/Post.ts` — wire them via `.inputValidator()` and let `z.infer` type the handler.

**`post.service.ts:51/58` & `comment.service.ts:43/65` — `throw new Error` for expected failures (not found / forbidden).** DESIGN_PATTERNS §3 requires `ServerResult<T>` (`{ ok:false, error, message }`) for expected failures; `throw` is reserved for infrastructure faults. This forces the UI into `try/catch` and loses typed error codes. Known drift, but it is the dominant shape in the services layer.

**Engagement counters have no write path — feed ranking is sorting on dead data.** `post.likes/comments/shares` (`schema.ts:142-144`) are denormalized integer columns, but `createComment` (`comment.service.ts:14`) never increments `post.comments` (the code comment even flags it), and there is no like/share handler anywhere. `getFeed` orders by `desc(likes)`, a value nothing ever updates. Either maintain these counters transactionally on each action or derive them; otherwise the "algorithm feed" ranks everything at 0.

## Consider

**Triple source of truth for post publish-state.** `post` carries `post_status` enum (with a `published` member), `is_published` boolean, and `published_at` timestamp (`schema.ts:137-140`). `getFeed` filters `is_published` while `postStatusIndex`/`postAuthorIndex` key off `post_status` — they can silently disagree. Collapse to one canonical field (`post_status` + derived `published_at`).

**`FeedList.tsx:33` imports the runtime `SessionData` Zod schema from `server/lib/session.ts`.** That module also top-level-imports `jose` (`EncryptJWT`, `jwtDecrypt`) and defines `createServerFn` crypto handlers. Importing a value (not a type) risks pulling server crypto into the client bundle. Move `SessionData` (and the feed input schema) to a client-safe module under `src/verification/`. The other component imports (`Navbar.tsx:2`, `auth/index.tsx:6`, `useAuthGuard.ts:12`) are `import type` and fine.

**`auth0.service.ts:57-64` (`getAuth0UserInfo`) — dead stub with a broken guard.** `const session = await getSession(); if (!session) return null` — `getSession` returns `{ session, status }`, always truthy, so the guard never fires; the function then returns `null` unconditionally anyway. Remove it or fix the destructure.

**`src/routes/Todo.tsx` — dev-scaffolding route publicly reachable at `/Todo`** with no guard. Delete before deploy.

**Cloudflare Workers fitness: overall good.** Neon HTTP driver + lazy `Proxy` (`db/index.ts`, `redis/index.ts`) correctly handle per-request env injection with no persistent sockets; PKCE state is cookie-based (`auth0.ts:88`), not in-memory; crypto uses Web Crypto / `jose`. Two caveats: `imagekit.service.ts:18` imports Node's `crypto` (`createHmac`) — verify `nodejs_compat` is enabled in `wrangler.jsonc` or switch to `crypto.subtle`; and `rateLimiter.ts` `analytics: true` adds a Redis write per request at the edge.

---

## Modernization notes: routes & data flow

The app is mid-migration: route guards and data loading are duplicated, one feed is SSR and the other is client-only, and the write layer has no validation boundary. The five highest-leverage structural changes:

1. **Decrypt the session once, flow it through router context.** Do the single `getSession()` in the top `beforeLoad`, return `{ session }`, and have every child loader and the rate limiter read it from `context` — never re-call `getSession()`. This removes the 3-4× decryption and makes the middleware chain the sole session reader, exactly as the README claims it already is.

2. **Load both feeds in route loaders, not one in SSR and one in `useEffect`-style client queries.** Right now "For You" is prefetched in `index.tsx` while "Following" only ever loads client-side inside `FeedList`. Move both behind the loader with TanStack Query `prefetchInfiniteQuery` + streaming/deferred, so tab switches hit warm cache and SSR covers the authenticated feed too. Make the public feed actually public (`optionalAuthMiddleware`).

3. **One pagination strategy: keyset cursors for both feeds, with indexes to match.** Drop OFFSET from `getFeed`, adopt the same `(sortKey, postId)` compound cursor `getFollowingFeed` already uses, and add the composite indexes (`(is_published, likes, published_at)` and `(author_id, published_at, post_id)`). This is the difference between a feed that scales and one that seq-scans at page 20.

4. **Re-establish the validation triangle on every server fn.** Replace all `data as any` with `.inputValidator(zodSchema)` from `src/verification/`, and return `ServerResult<T>` for expected failures. This is the boundary that the whole "service / verifier / validation" architecture in §7 depends on — without it the pattern is documentation only.

5. **Consolidate post publish-state and give engagement counters a real write path.** Pick `post_status` as canonical (derive `published_at`), and either maintain `likes/comments/shares` on each action or compute them — so the ranking feed sorts on live data instead of permanent zeros.

Architecture is otherwise coherent and Workers-appropriate; the defects above are concentrated in the data-flow/validation seam and the feed hot path, which is precisely the surface a modernization pass should target.
