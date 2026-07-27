# F1 — Runtime & Data Model

The ground everything else stands on: the edge runtime's hard limits, the 26-table schema as a data story, and the two ORM rules you must never break. Read this before any feature.

## 1. The edge runtime changes what "normal" means

You deploy to Cloudflare Workers, not Node. Four constraints ripple through every later decision:

- **Web APIs only.** No `fs`, no raw sockets, no Node crypto callbacks. Use `crypto.subtle` / `crypto` (via `nodejs_compat`), `fetch`, `TextEncoder`. Invariant 6.
- **No interactive transactions.** The neon-http driver has no `BEGIN…COMMIT`. So every multi-step write is a **deliberately-ordered non-atomic sequence** — you order the steps so the worst case of a mid-sequence failure is harmless (a counter re-read), never corruption. This is why the idempotent toggle ([F3]) is written the way it is, and why `purgePost` deletes children before parents by hand.
- **Post-response work must be handed off.** A promise you don't await is killed once the response is sent. Background jobs (search enrichment, notification fan-out) use `waitUntil()` from `cloudflare:workers`. See [F5], [F3].
- **One binding.** `wrangler.jsonc` declares only the `AI` binding (Workers AI). There is **no R2 or KV** — media lives in ImageKit ([F4]), sessions live in an encrypted cookie ([F2]), rate-limit state lives in Upstash Redis over HTTP ([F3]). A daily cron trigger drives `purgeExpiredRemovedPosts`.

> **Answer key:** `ai:src/worker-entry.ts` (custom entry adding `scheduled()`), `ai:wrangler.jsonc`.
> **Watch-out:** `src/types/cloudflare-env.d.ts` is a hand-written stopgap for the `AI` binding type until `wrangler types` is run.

## 2. The schema as a data story (26 tables)

Every id is a CUID2 (`varchar` PK, `$defaultFn(() => createId())`). Walk it by concern, not alphabetically.

### Identity — *who*
`user` (name, unique `nickname`, unique `email`, `authProviderId`, `emailVerified`, and the account sanction `isBanned`/`bannedAt`/`banReason`) · `profile` (1:1 with user — bio/website/location/avatar, `isVerified`, the awareness flag `hideEngagementCounts`, and `pinnedPostId`) · `siteRole` (site-wide role grant, one row = one grant) · `roleGrant` (hashed one-time redeemable keys).

**Rule — the ban is a live check, not a session flag.** `isBanned` lives on `user` and is read on *every* authed request by the middleware ([F2]), so a ban takes effect on the banned user's next request, not when their cookie expires.

### Content — *what*
`categories` (name is the PK — the AI category system references it by name) · `post` · `media` · the junctions `postToMedia` / `postToCategory` / `postToUser` · `comment` / `commentReply`.

`post` is the centre of gravity. Beyond `content`/`author_id`, note: `post_status` (8-state enum: editing→draft→pending→published→unpublished→archived→rejected→removed), `is_published` + `published_at`, `moderationReason` (shown to the owner), `scheduledPurgeAt` (set on removal → the 3-day undo window before the cron hard-deletes), the search columns `transcript` + `keywords[]` ([F5]), the denormalized counters `views`/`likes`/`comments`/`shares`, and `media_quality`.

> **Watch-out — three fields encode one truth.** `post_status`, `is_published`, and `published_at` can disagree; `MODERNIZATION_PLAN.md` item 24 ("collapse to one canonical `post_status`") was never done. When you rebuild publish/unpublish, treat `post_status` as the source of truth and derive the others — don't let a feature flip only one of them.

### Engagement — *reactions*, and the counter trick
Per-user idempotent rows: `postLike`, `commentLike`, `commentReplyLike`, `savedPost` — each has a `unique(target_id, user_id)`. The denormalized counters on `post`/`comment` are what the feed and UI actually read, so they must move with the row.

### Social graph — *relationships*
`follow` (directional: `followerId` follows `followedId`, with a `unique` pair) · `userBlock` (mirror shape: `blockerId` blocks `blockedId`).

> **Watch-out — block is written but not enforced.** `userBlock` rows exist, but feed/comment read queries in `queries.ts` don't yet exclude blocked users (`partial`). Enforcing it is a [P4]/[P1] task.

### Moderation & roles — *governance*
`profileMember` (per-profile mod team, `profileRoleEnum`: moderator < vip_moderator < co_owner) · `report` (target polymorphic by `targetType`+`targetId`, status enum) · `auditLog` (every privileged action, `auditActionEnum`). Site-wide: `siteRole` + `roleGrant`. Two parallel RBAC ladders live here — see [P5], [F3].

**Rule — one owner, enforced by the DB.** `siteRole` carries a partial `uniqueIndex … where role = 'owner'`, so at most one owner row can ever exist. `roleGrant` has a CHECK that a key can never grant `owner`.

### Awareness signals — *the app's memory of actions* ([F5])
`notification` (+ `notificationTypeEnum`, loose `entityId`/`postId` refs) · `notificationPreference` (per-type opt-out; a row is an *exception*, absence = enabled) · `mutedKeyword` (per-user feed word mute) · `searchClick` (one row per search-result open; `userId` nullable because search is public).

### Monetization — *unbuilt*
`subscription` (Stripe columns) — **`planned · not built`**: the table exists, no service or UI references it.

> **Answer key:** `ai:src/server/db/schema.ts`, `ai:src/server/db/relations.ts`.

## 3. Three schema patterns to internalize

### (a) Idempotent per-user action + denormalized counter
The shape behind like/save/block/comment-like. The `unique` makes double-calls safe; the counter is kept honest and floored.

```ts
export const postLike = pgTable("post_like", { /* … */ }, (t) => ({
  postLikeUnique: unique("post_like_unique").on(t.postId, t.userId), // one per user
}))
// counter upkeep, on the post row (never lets it go negative):
set({ likes: sql`GREATEST(${post.likes} - 1, 0)` })   // on unlike
set({ likes: sql`${post.likes} + 1` })                 // on like
```
Full mechanics in [F3] "idempotent toggle".

### (b) CHECK-constrained polymorphic media
One `media` table serves image/video/audio; the *shape rules per type* are enforced in the DB, not just in code — so a bad row can't exist even if a bug slips past validation.

```ts
// image + video MUST have width/height; audio MUST NOT:
check("visual_media_requires_dimensions",
  sql`(${t.media_type} = 'audio' OR (${t.width} IS NOT NULL AND ${t.height} IS NOT NULL))`)
// video + audio MUST have duration; image MUST NOT:
check("temporal_media_requires_duration",
  sql`(${t.media_type} = 'image' OR ${t.duration} IS NOT NULL)`)
```
When you build the upload path ([F4]), normalize each row to satisfy these *before* insert (image → null duration; audio → null width/height; video → both + thumbnail).

### (c) Full-text search via a functional GIN index
Search ranks over `content` + `keywords`, not `transcript` (its words already flow into `keywords`, so indexing it too would double-count).

```ts
postSearchIndex: index("post_search_index").using(
  "gin", sql`closfa_post_tsvector(${t.content}, ${t.keywords})`)
```
**Rule — the index needs a function that Drizzle can't create.** `to_tsvector(regconfig,text)` is only `STABLE`, so Postgres refuses it in an index expression. The fix is a thin `IMMUTABLE` SQL wrapper `closfa_post_tsvector(...)` that must exist *before* the index — created out-of-band by a script, because drizzle-kit only diffs tables/columns/indexes, never functions.

> **Answer key:** `ai:scripts/create-search-function.mjs` (creates the wrapper), `ai:scripts/seed-categories.mjs`, `ai:scripts/backfill-keywords.mjs`.
> **Watch-out:** `npm run db:push` cannot create the function or backfill keywords — those scripts run once, by hand, and are safe to delete after.

## 4. The ORM two-API rule (hard invariant #2)

Drizzle exposes two APIs with **incompatible filter syntax**. Using the wrong one is a type error or a silently wrong query.

| API | Use for | Filter syntax |
|---|---|---|
| Relational — `db.query.*.findMany/findFirst` | reads with relations | **object**: `{ where: { userId } , with: {...} }` |
| Builder — `db.insert/update/delete` (and complex reads) | writes | **operators**: `eq()`, `and()`, `or()`, `inArray()` |

```ts
// READ (relational, object filter):
const p = await db.query.post.findFirst({ where: { postId }, with: { media: true } })
// WRITE (builder, operator functions):
await db.update(post).set({ likes: sql`${post.likes}+1` }).where(eq(post.postId, postId))
```

**Rules:** never mix the two · never silence a filter type error with `as any` (it means you're on the wrong API) · never loop awaited single-row queries — batch with `insert().values([...])` and `inArray()` (no interactive transactions means N+1 is doubly expensive).

> **Watch-out — the one sanctioned cast.** `queries.ts` has a helper `w(filter) = filter as any` and several `as unknown as X` casts. These exist **only** to work around Drizzle `v1.0.0-beta.23` inference bugs and are documented as such. Treat them as drift to isolate, not a pattern to spread. When the beta type bugs are fixed, they should disappear.

## 5. Pagination is a per-feed choice

Not one strategy — the right one depends on the sort key's stability.

- **For-You feed → offset paging.** It ranks on `ORDER BY likes DESC, published_at DESC`. `likes` mutates while you scroll, so a keyset cursor would skip or duplicate rows. Offset accepts that risk deliberately. Backed by `postFeedRankIndex (is_published, likes, published_at)`.
- **Following feed → keyset cursor.** Stable time order, so a cursor `` `${published_at}_${postId}` `` is safe and cheaper. The `postId` tiebreaker column is why `postPublishedAtPostIdIndex (published_at, post_id)` exists — without it the equal-timestamp branch of the cursor can't use the index.

```ts
// keyset cursor build (Following):
if (direction === 'older' && posts.length === limit)
  nextCursor = `${last.published_at.toISOString()}_${last.postId}`
```

> **Answer key:** `ai:src/server/queries.ts` (`getFeed` offset, `getFollowingFeed` keyset, `search`), `ai:src/server/actions/Database/services/feed.service.ts`.
> **Watch-out:** the read layer also runs `sanitizeAuthorNames()` and a `PUBLIC_USER_COLUMNS` allowlist so an email-shaped `name` or `authProviderId` never leaks into a feed payload — carry that habit into any new read. See [F2].

---

**Next:** [F2] Auth & Session (how a request proves who it is) · [F3] Server Contract (how a server function is shaped) · then the feature pages that read and write these tables.
