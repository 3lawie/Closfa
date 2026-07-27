# P3 — Create & Manage Post

## Pages

### (a) Create
**Route:** `/create` (authenticated)
**File:** `src/routes/_authenticated/create.tsx`
Loads via client-side component state; no server loader. Integrates `MediaContainer` manager for file staging. Implements a search box using `searchUsersByNicknameFn` (useQuery) for collaborator selection. Executes an imperative publish pipeline triggered by user action.

### (b) Manage
**Route:** `/my-posts` (authenticated)
**File:** `src/routes/_authenticated/my-posts.tsx`
Loads data using a TanStack Start `loader` that fetches the user's authored posts and pending collaboration invites simultaneously (`Promise.all`, fail-soft). Feeds two distinct `useQuery` calls via `initialData` to hydrate the client cache immediately ([P1] loader+initialData pattern).

---

## Features

### 1. Compose media
**Feature** — Stage and process media files client-side before upload.
**Rules** — MediaContainer must enforce a strict limit of 12 files and 12MB total. Reordering must be supported. Thumbnail and waveform generation runs in the background without blocking the UI.
**Pattern** — Client-side Persistence [F4].
**Data** — IndexedDB (staging store).
**Connections** — Publish pipeline, ImageKit.
**Hint**
```typescript
const [media, setMedia] = useMediaStore();
// Enforce limits in MediaContainer
const handleAdd = (file) => {
  if (media.length >= 12 || getTotalBytes(media) + file.size > 12 * 1024 * 1024) return;
  addFile(file); // triggers background thumb
};
```
**Answer key** — `ai:src/components/Dahsboard/MediaContatiner.tsx`
**Watch-out** — None.

### 2. Compose text + category
**Feature** — Validate post content and link to a valid category.
**Rules** — Content must pass validation. `post_category` is required and acts as a Foreign Key to `categories.name`; the DB will reject writes with unknown categories. Mentions detected in content must trigger notifications ([F5]).
**Pattern** — Form Validation [F5].
**Data** — `post` (content, post_category → FK `categories.name`), `categories`.
**Connections** — Mention parser, Notification service ([F5]).
**Hint**
```typescript
const schema = z.object({
  content: z.string().min(1).max(5000),
  post_category: z.string(),   // just a string in the schema …
})
// … the DB enforces validity: post.post_category is a FK to categories.name,
// so an unknown category is rejected at INSERT — no async Zod refine needed.
```
**Answer key** — `ai:src/routes/_authenticated/create.tsx`
**Watch-out** — None.

### 3. Invite collaborators
**Feature** — Associate co-authors with a post via invitations.
**Rules** — Invites are written to `postToUser` at publish time with `accepted=false`. Acceptance updates `accepted=true` and sets `respondedAt`. Decline performs a hard DELETE of the row. Only rows with `accepted=true` are counted as co-authors.
**Pattern** — Referential Integrity [F1].
**Data** — `postToUser` (postId, userId, accepted, respondedAt).
**Connections** — `collab.service.ts`, Notification system.
**Hint**
```typescript
// at publish (post.service.ts): an invite is a postToUser row, accepted:false
await db.insert(postToUser).values({ post_id: postId, user_id: inviteeId, accepted: false })
// accept (collab.service.ts): builder API + operator filters ([F1])
await db.update(postToUser).set({ accepted: true, respondedAt: new Date() })
  .where(and(eq(postToUser.post_id, postId), eq(postToUser.user_id, userId)))
```
**Answer key** — `ai:src/server/actions/Database/services/post.service.ts`
**Watch-out** — None.

### 4. Publish end-to-end
**Feature** — Process edits, uploads, and the DB write as an ordered (non-atomic) pipeline.
**Rules** — 1) Bake image edits client-side. 2) Call `getImageKitAuthBatch` once. 3) Upload to ImageKit in parallel. 4) Track progress via byte-weight. 5) A failed MAIN file aborts; a failed thumbnail is tolerated. 6) Call `createPostWithMedia`. 7) On success, clear IndexedDB and invalidate the feed cache. 8) Filename keywords are extracted instantly at INSERT. 9) Background enrichment is kicked off with `waitUntil` ([F5]).
**Pattern** — Ordered non-atomic pipeline [F1] (no transactions on the edge) + [F3] `ServerResult`.
**Data** — `post` (keywords), `media`, `postToMedia`.
**Connections** — ImageKit ([F4]), the `createPostWithMedia` server fn, feed cache.
**Hint**
```typescript
const baked    = await Promise.all(media.map(applyImageEdit));          // 1. bake edits
const auths    = await getImageKitAuthBatch({ data: filesMeta });        // 2. ONE batch sign
const uploaded = await Promise.all(baked.map((f, i) => upload(f, auths[i]))); // 3. parallel
// a failed MAIN file aborts; a failed thumbnail is tolerated
const res = await createPostWithMedia({ data: { content, mediaIds } });  // 4. ServerResult<{postId}>
if (res.ok) { await clearAllMedias(); queryClient.invalidateQueries({ queryKey: ['feed'] }) }
```
**Answer key** — `ai:src/routes/_authenticated/create.tsx`
**Watch-out** — Drift: `createPostInput` schema (inline) has diverged from `src/verification/post.validation.ts`.

### 5. Post status lifecycle
**Feature** — Manage the moderation and visibility state of a post.
**Rules** — `post_status` enum is the single source of truth (draft -> pending -> published/rejected/removed). `is_published` and `published_at` must be derived values, not set directly.
**Pattern** — State Machine [F1].
**Data** — `posts` (post_status, is_published, published_at).
**Connections** — Feed queries, Moderation views.
**Hint**
```typescript
const getStatus = (post) => post.post_status;
const isPub = (status) => status === 'published';
// Never set is_published manually in write ops
```
**Answer key** — `ai:src/server/actions/Database/services/post.service.ts`
**Watch-out** — Drift: Plan item 24 identifies `post_status` / `is_published` disagreement (partial implementation).

### 6. Resubmit
**Feature** — Return a rejected draft to the moderation queue.
**Rules** — Actionable only on posts with status 'rejected' or 'sent-back'. Clears the `moderationReason` field and transitions status to 'pending'.
**Pattern** — Mutation Update [F3].
**Data** — `posts` (post_status, moderationReason).
**Connections** — Moderator queue.
**Hint**
```typescript
await resubmitPostFn({ postId });
// Effect: { status: 'pending', moderationReason: null }
```
**Answer key** — `ai:src/server/actions/Database/services/post.service.ts`
**Watch-out** — None.

### 7. Set own visibility
**Feature** — Allow the post owner to publish or unpublish directly.
**Rules** — Verify ownership before applying changes. Toggles status between 'published' and 'draft' (or appropriate visibility state) per business logic.
**Pattern** — Ownership Guard + Mutation [F3].
**Data** — `posts` (post_status, author_id).
**Connections** — Feed visibility.
**Hint**
```typescript
await setOwnPostVisibilityFn({ postId, status: 'published' });
// Checks: post.author_id === userId
```
**Answer key** — `ai:src/server/actions/Database/services/post.service.ts`
**Watch-out** — None.

### 8. Respond to collab invites
**Feature** — Accept or decline invitations received by the user.
**Rules** — Uses `getPendingCollabInvitesFn` to list invites. `respondToCollabInviteFn` handles the logic: Accept updates `accepted=true`; Decline performs a hard DELETE.
**Pattern** — CRUD [F1].
**Data** — `postToUser`.
**Connections** — `/my-posts` UI, Author notifications.
**Hint**
```typescript
const invites = await getPendingCollabInvitesFn(userId);
await respondToCollabInviteFn({ inviteId, action: 'decline' }); // DELETE
```
**Answer key** — `ai:src/server/actions/Database/services/collab.service.ts`
**Watch-out** — Notifications for collab invites bypass the [F5] coalescing/opt-out writer.

### 9. Delete own post
**Feature** — Remove a post with a grace period for undo.
**Rules** — Soft-delete only. Flips `post_status` to 'removed', sets `is_published` to false, and sets `scheduledPurgeAt` to `now() + 3 days`. A daily cron job performs the hard delete after the window. Do not hard-delete inline.
**Pattern** — Soft Delete [F1].
**Data** — `posts` (post_status, is_published, scheduledPurgeAt).
**Connections** — Cron scheduler, Trash/Recovery UI.
**Hint**
```typescript
await deletePost({ postId });
// Logic:
// status: 'removed'
// is_published: false
// scheduledPurgeAt: Date.now() + 259200000
```
**Answer key** — `ai:src/server/actions/Database/services/post.service.ts`
**Watch-out** — [F5]/[P1] specific: Ensure cron respects the 3-day window.

---

## Gaps

*   **Edit-post** — `planned · not built`. `updatePostValidation` exists in logic, but no API endpoint or UI exists to edit a post after publication.
*   **Canonical post status** — `partial`. `post_status`, `is_published`, and `published_at` can currently disagree (see Plan item 24). Rebuild should enforce `post_status` as the source of truth and derive others.