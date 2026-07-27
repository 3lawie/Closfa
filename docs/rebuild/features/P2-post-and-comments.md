# P2 — Post & Comments

The page where every server-side write pattern from [F3] comes together: like, comment, reply, save, share, report, mention, view. If you build this well, the rest of the write surfaces are variations on it.

## The page(s)

One post is shown two ways off **the same cached query** `['post', postId]`:

- **`/post/$postId`** (public, `post.$postId.tsx`) — the standalone detail route. `loader` calls `getPostFn` (SSR), a `useQuery` is seeded with it via `initialData` ([P1] pattern), and `recordPostViewFn` fires fire-and-forget.
- **`PostModal`** — the same content as an overlay, opened by the root `post` search param (so any `PostCard` can deep-link into it without navigation).

Both render `PostCard` + `CommentComposer` + `CommentItem`. Because they share `['post', postId]`, a comment posted in the modal updates the detail route and vice-versa — build that shared key deliberately.

```ts
// post.$postId.tsx — loader + initialData seed, view recorded once
loader: async () => ({ post: await getPostFn({ data: { postId } }).catch(() => null) }),
// in the component:
const q = useQuery({ queryKey: ['post', postId], queryFn: () => getPostFn({ data: { postId } }),
                     initialData: loaderData.post ?? undefined })
useEffect(() => { recordPostViewFn({ data: { postId } }) }, [postId]) // fire-and-forget
```
> **Answer key:** `ai:src/routes/post.$postId.tsx`, `ai:src/components/feed/PostModal.tsx`.
> **Watch-out:** `getPostFn` returns `post | null` (a loader shape), **not** a `ServerResult` — that's the deliberate exception for reads ([F3] §4). Comment lists are typed `any` here and there's a `post as unknown as Post` cast (RPC inference collapse) — isolate, don't spread.

---

## Feature — View & record a view

**Purpose:** show the post and count the read without blocking it.
**Rules:** the view counter is best-effort — a failed increment must never break rendering; recording uses `optionalAuthMiddleware` (guests are viewers too).
**Data:** `post.views` (denormalized counter). **Connections:** if the user arrived from search, also fire `logSearchClickFn` → [F5] click-learning.
**Hint:**
```ts
export const recordPostViewFn = createServerFn({ method: 'POST' })
  .middleware([optionalAuthMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string() }))
  .handler(async ({ data }) => { /* views = views + 1 */ return ok({ views }) })
```
> **Answer key:** `ai:src/server/actions/Database/services/post.service.ts` (`recordPostViewFn`).

---

## Feature — Like a post  ⭐ (the reference write)

**Purpose:** toggle a like and keep the feed's ranking counter honest.
**Rules:** one like per user per post — the DB `unique("post_like_unique")` makes the API safe to call twice; the heart is a *toggle* (a second call unlikes); `post.likes` is the denormalized counter the feed sorts on, so it must move with the like and **never** go negative; liking notifies the author, unliking does not; a self-like counts but skips the self-notification.
**Pattern:** **[F3] idempotent toggle** — no transaction, ordered so the worst race is a harmless re-read.
**Data:** `post_like(post_id,user_id)` unique; `post.likes`. **Connections:** → **[F5]** `createNotification({ type:'like' })` (coalesced); UI = **[P7]** optimistic.
**Hint:**
```ts
const removed = await db.delete(postLike)
  .where(and(eq(postLike.postId, postId), eq(postLike.userId, userId))).returning({ id: postLike.id })
if (removed.length) { /* likes = GREATEST(likes-1,0) */ return ok({ liked: false, likes }) }
await db.insert(postLike).values({ postId, userId }).onConflictDoNothing()
/* likes = likes+1 ; if not self: waitUntil(notify author) */ return ok({ liked: true, likes })
```
> **Answer key:** `ai:src/server/actions/Database/services/like.service.ts` (+ `getPostLikersFn` for the "liked by" list). This exact shape recurs for save, block, comment-like, reply-like — learn it once.
> **Watch-out:** the AI file logs with raw `console.error` here — use **[F3] `logger`** on rebuild.

---

## Feature — Comment

**Purpose:** add a top-level comment and keep the post's comment counter + author informed.
**Rules:** validated via the shared `createCommentValidation` ([F3]); insert then bump `post.comments`; a sticker comment must carry a `media_id` (DB CHECK); parse `@mentions` in the body.
**Data:** `comment`, `post.comments`. **Connections:** → **[F5]** `createNotification({ type:'comment' })` + `notifyMentions`.
**Hint:**
```ts
await db.insert(comment).values({ postId, userId, comment: text, comment_type })
await db.update(post).set({ comments: sql`${post.comments} + 1` }).where(eq(post.postId, postId))
waitUntil(createNotification({ recipientId: authorId, actorId: userId, type: 'comment', entityId: commentId, postId }))
waitUntil(notifyMentions(text, userId, postId))
```
> **Answer key:** `ai:src/server/actions/Database/services/comment.service.ts` (`createComment`).

---

## Feature — Reply (one level deep)

**Purpose:** reply to a comment; keep the parent's reply counter honest.
**Rules:** `commentReply` carries `parent_comment_id` + `post_id`; insert then bump `comment.comment_reply_count`. One level only — replies don't nest further.
**Data:** `commentReply`, `comment.comment_reply_count`. **Connections:** → **[F5]** `type:'reply'` notify + mentions.
> **Answer key:** `comment.service.ts` (`createReply`). UI thread line + per-reply state in `ai:src/components/feed/CommentItem.tsx`.

---

## Feature — Like a comment / reply

**Purpose:** two-level like toggles.
**Rules:** identical **[F3] idempotent toggle** over `commentLike` / `commentReplyLike`, each with its own `unique(target_id,user_id)` and `GREATEST(c-1,0)` counter.
> **Answer key:** `comment.service.ts` (`toggleCommentLike`, `toggleReplyLike`).

---

## Feature — Delete comment / reply (mod-aware, with undo)

**Purpose:** let the owner *or* a moderator remove a comment, cleaning up children and counters.
**Rules:** authorized if `isOwner || getProfilePermission(...).canDeleteComment` ([F3]); **replies must be deleted first** (no cascade — [F1] no transactions), and `post.comments` is decremented by `1 + removedReplyCount`; when a **moderator** (not the owner) deletes, write an `auditLog` row ([P5]).
**Data:** `comment`/`commentReply`, `post.comments`, `auditLog`. **Connections:** authorization = [F3] verifier.
**Hint (the counter math is the trap):**
```ts
const removedReplyCount = comment.comment_reply_count ?? 0
await db.delete(commentReply).where(eq(commentReply.parent_comment_id, commentId))
await db.delete(comment).where(eq(comment.comment_id, commentId))
await db.update(post).set({ comments: sql`GREATEST(${post.comments} - ${1 + removedReplyCount}, 0)` })
```
**UI pattern — delete-with-undo:** hide the comment immediately (render `null`), fire a Toast with an "Undo" action, and only call the real delete after a 5-second `setTimeout`; Undo clears the timer so nothing ever reaches the server.
> **Answer key:** `comment.service.ts` (`deleteComment`/`deleteReply`), UI in `ai:src/components/feed/CommentItem.tsx` + `ai:src/components/ui/Toast.tsx`.

---

## Feature — Save & Share

- **Save** — **[F3] idempotent toggle** over `savedPost`; no counter, no notification; listed on [P6]/`/saved`. *Watch-out:* `savedPost.service.ts` hand-rolls the result shape instead of `ok()/err()` — rebuild with the constructors.
- **Share** — `incrementShareFn` bumps `post.shares` (`optionalAuth`); the client copies the `/post/$postId` link.
> **Answer key:** `ai:src/server/actions/Database/services/savedPost.service.ts`, `post.service.ts` (`incrementShareFn`).

---

## Feature — Report

**Purpose:** flag a post/comment/user for moderators.
**Rules:** the report dialog carries a **Turnstile** token that `reportContent` verifies first, failing closed in production ([F2]); the resulting notification sets `actorId = null` (anti-retaliation). Full queue/resolution flow is [P5].
> **Answer key:** `ai:src/server/actions/Database/services/moderation.service.ts` (`reportContent`), dialog in `PostCard`.

---

## Feature — Mentions

**Purpose:** `@nickname` in a post or comment notifies that user.
**Rules:** `notifyMentions` regex-extracts `@nickname`, looks the users up with a single `inArray` (no N+1, [F1]), and fans out `createNotification({ type:'mention' })` in parallel.
**UI:** `MentionTextarea` overlays a highlighted backdrop `<div>` under a transparent textarea and autocompletes via `searchUsersByNicknameFn`.
> **Answer key:** `ai:src/components/feed/MentionTextarea.tsx`, `notification.service.ts` (`notifyMentions`).
> **Watch-out:** the autocomplete dropdown anchors under the textarea, not at the caret (a documented first-pass shortcut).

---

## Feature — Hide engagement counts (rendering side)

When the author's `hideEngagementCounts` is on ([F5]/[P4]), `PostCard` renders the like/comment/share **icons without numbers** and hides the view counter entirely — for every viewer, including the author. The actions still work; only the numbers are muted.
> **Answer key:** `ai:src/components/feed/PostCard.tsx`.

---

**Next:** [P3] Create & Manage (where posts are born) · [P7] Design System (the optimistic-UI and primitive patterns these features render through).
