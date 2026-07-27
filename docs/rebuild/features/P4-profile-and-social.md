# P4 — Profile & Social

**Route**
`/profile/$nickname` (public view). `src/routes/profile.$nickname.tsx`.

**Data-Loading**
- `loader` calls `getUserProfileFn`: aggregates `user`, `profile`, follower/following `counts`, and the `pinnedPostId`. Wrapped via `[F2] optionalAuthMiddleware`.
- State updates (e.g., follow/unfollow) use a `useMutation` followed by `router.invalidate()` to refetch the loader.
- `getMyProfilePermissionFn` gates moderation-team affordances.

---

### 1) View profile + pinned post
Render user details, social counts, and prioritize the pinned post.

> **Rules**
> - Render the single `pinnedPostId` at the top of the feed.
> - Skip rendering the pinned post if its `post_status` is not `published` (respect soft-deletes).

> **Pattern**
> Aggregate Loader.

> **Data**
> - `user` (name, avatar)
> - `profile` (bio, website, nickname)
> - `counts` (followers, following)
> - `posts` (pinnedPostId, post_status)

> **Connections**
> - Feeds, Profile Stats.

> **Hint**
> ```typescript
> loader = async ({ params }) => {
>   return await getUserProfileFn(params.nickname, auth);
> }
> // render: data.pinnedPostId && data.pinnedPost.status === 'published'
> ```

> **Answer key**
> `ai:src/routes/profile.$nickname.tsx`

> **Watch-out**
> Strictly check `post_status`; pinned posts are soft-deleted, not removed from the relation.

---

### 2) Follow / unfollow
Toggle the follow state between users.

> **Rules**
> - Idempotent `SELECT-or-INSERT` operation.
> - Reject self-follow with `BAD_REQUEST`.
> - Notify the followed user via `[F5]`.
> - NON-optimistic: invalidates router to refetch counts.

> **Pattern**
> `[F3] Idempotent Toggle` (Refetch variant). See `[P7]` for upgrade path.

> **Data**
> - `follow` (followerId → the follower; followedId → the one being followed).

> **Connections**
> - `[F5]` Notification Service, Profile Counts.

> **Hint**
> ```typescript
> mutation.mutate({ targetId });
> // onSuccess: router.invalidate();
> ```

> **Answer key**
> `ai:src/server/actions/Database/services/follow.service.ts`

> **Watch-out**
> Invalidate-then-refetch causes UI lag. Consider `[P7] useOptimistic` for button state toggle, though counts will still need refetch.

---

### 3) Block / unblock
Block a user from interacting (write-only implementation).

> **Rules**
> - Idempotent toggle over `userBlock` table.
> - Self-block must be guarded/rejected.
> - No notification sent.

> **Pattern**
> `[P1]` / Idempotent Toggle.

> **Data**
> - `userBlock` table (blocker_id, blocked_id).

> **Connections**
> - None active (partial).

> **Hint**
> ```typescript
> await toggleBlock(blockerId, blockedId);
> ```

> **Answer key**
> `ai:src/server/actions/Database/services/block.service.ts`

> **Watch-out**
> **Partial Feature**. Block row is written but NOT yet excluded from feed/comment read queries (`[F1]/[P1]` enforcement pending).

---

### 4) Pin / unpin a post
Set or remove the featured post on a profile.

> **Rules**
> - Owner-only action.

> **Pattern**
> Ownership Guard.

> **Data**
> - `profile.pinnedPostId`.

> **Connections**
> - Profile View.

> **Hint**
> ```typescript
> await pinPostFn(postId); // or unpinPostFn()
> ```

> **Answer key**
> `ai:src/server/actions/Database/services/moderation.service.ts`

---

### 5) Edit own profile
Update profile fields and avatar via modal.

> **Rules**
> - Avatar upload via `[F4]`.
> - Nickname sanitized to `[a-z0-9_]`.
> - PG error 23505 maps to "nickname taken".
> - `updateDisplayName` re-mints session cookie (`[F2]`) because name/nickname live in the session.

> **Pattern**
> `[F4] Avatar Upload`, `[F2] Session Refresh`.

> **Data**
> - `profile` (avatar, name, nickname, bio, website, location).
> - `session` cookie.

> **Connections**
> - Auth State.

> **Hint**
> ```typescript
> handleSave = async (vals) => {
>   await updateProfile(vals);
>   updateDisplayName(user); // re-mint session
> }
> ```

> **Answer key**
> `ai:src/components/profile/EditProfileModal.tsx`

> **Watch-out**
> Drift: `updateProfile` function maps `imageMediaId` argument to `profile.avatar` column (name mismatch).

---

### 6) Hide engagement counts
Conditionally strip social metrics from the UI.

> **Rules**
> - When `profile.hideEngagementCounts` is on, render like/comment/share icons WITHOUT numbers.
> - Hides the view counter.
> - Applies to every viewer, including the author.

> **Pattern**
> `[F5]` Conditional Render.

> **Data**
> - `profile.hideEngagementCounts`.

> **Connections**
> - Post Rendering Components.

> **Hint**
> ```typescript
> {!author.hideEngagementCounts && <CountLabel>{count}</CountLabel>}
> ```

> **Answer key**
> `ai:src/routes/profile.$nickname.tsx`

---

### 7) Manage moderation team
Assign hierarchical roles to profile members.

> **Rules**
> - Roles: `moderator` < `vip_moderator` < `co_owner`.
> - Must enforce `[F3] escalation guard` (cannot promote to equal/higher than self).

> **Pattern**
> `[P5]` Role Management.

> **Data**
> - `profileMember` table (role).

> **Connections**
> - Permissions System (`getMyProfilePermissionFn`).

> **Hint**
> ```typescript
> assignRole({ userId, role: 'vip_moderator' });
> ```

> **Answer key**
> `ai:src/components/profile/ManageTeamModal.tsx`

---

### 8) Verified badge
Display verification status on the profile.

> **Rules**
> - Render `VerifiedBadge` when `profile.isVerified` is true.
> - The toggle is a site-role action detailed in `[P5]`.

> **Pattern**
> Conditional Render.

> **Data**
> - `profile.isVerified`.

> **Connections**
> - Profile Header UI.

> **Hint**
> ```typescript
> {profile.isVerified && <VerifiedBadge />}
> ```

> **Answer key**
> `ai:src/routes/profile.$nickname.tsx`

---