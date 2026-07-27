# P6 — Notifications & Settings

**Aware-Intention Framing**
These surfaces let a user turn the volume DOWN ([F5]). Nothing is deleted or hidden from anyone else; we are strictly adjusting signal noise for the viewer. Copy must reflect this: "Off just means quieter."

## Routing & Data Loading

The application uses a hybrid routing strategy for notifications and settings. The Notifications Drawer is a **global singleton** mounted in `__root`, controlled via a root search parameter rather than a dedicated route segment. The Settings page is a distinct authenticated route with zero server-side loaders (all data is fetched client-side).

| Route Component | Path | Implementation | Data Strategy |
|-----------------|------|----------------|---------------|
| Notifications Stub | `/notifications` | Redirect loader | Sets `?notifications=true` param on root |
| Global Drawer | (Root Layout) | `src/components/feed/NotificationsDrawer.tsx` | Fetches once/mutates; separate query for unread count |
| Settings | `/settings` | `src/routes/_authenticated/settings.tsx` | Client-only `useQuery`/`useMutation` per section |

The `/notifications` route exists solely as a user-accessible entry point to trigger the drawer state on the root layout.

## Features

### 1. Notifications Drawer
> Feature — Global right-side drawer displaying an icon-per-type list of user alerts.
> Rules — Actions route contextually: follow -> profile; moderation -> `/my-posts`; else set root search `{post, commentId}` to open post anchor. `markAsRead` / `markAllAsRead` must invalidate BOTH `['notifications']` and `['notifications', 'unreadCount']`.
> Pattern — Search Param State + Polling. The drawer visibility is URL state; content is live data. [F1].
> Data — `notification` (userId, actorId, type, entityId, postId, read, message).
> Connections — Fans out to Profile (`type=follow`), Moderation, and PostDetail (comment anchor).
> Hint —
```tsx
// src/components/feed/NotificationsDrawer.tsx
const { data } = useQuery(["notifications"]);
const { mutate: markRead } = useMutation({
  mutationFn: markAsReadFn,
  onSuccess: () => {
    invalidateQueries(["notifications"]);
    invalidateQueries(["notifications", "unreadCount"]);
  }
});
```
> Answer key — `ai:src/components/feed/NotificationsDrawer.tsx`
> Watch-out — The unread badge on AccountRail uses `getUnreadNotificationCountFn` polled ~60s; it shares the invalidation target with the drawer.

### 2. Notification Preferences
> Feature — Per-type opt-out toggles for controlling signal volume.
> Rules — Only `like`/`comment`/`reply`/`follow`/`mention` are user-toggleable; `system`/`moderation` are not. **Absence of a row = enabled** (the table stores only exceptions). A toggle upserts a row carrying the `enabled` flag via `onConflictDoUpdate` — it does not delete.
> Pattern — Sparse State via Upsert. Maintains "default on" invariant. [F5].
> Data — `notificationPreference`.
> Connections — Notification Writer (checks preference before dispatch).
> Hint —
```tsx
// src/routes/_authenticated/settings.tsx
const toggle = useMutation({
  mutationFn: (type) => upsertPreference({ type, enabled: !current[type] }),
  onMutate: ... // see Prescriptive Patterns
});
```
> Answer key — `ai:src/server/actions/Database/services/notification.service.ts`
> Watch-out — Server-side writer bypass: `collab_invite`/`moderation`/`system` ignore these preferences and write directly.

### 3. Muted Keywords
> Feature — Add/remove "chips" to hide terms from the user's own feed.
> Rules — Server must lowercase inputs. Inserts must be idempotent via `onConflictDoNothing`. Read logic must fold exclusion into viewer's feed queries only (never global).
> Pattern — Read-Side Filtering. Storage is simple; complexity is in [F1] `queries.ts`.
> Data — `mutedKeyword`.
> Connections — Feed Query Generator (injects WHERE clauses).
> Hint —
```tsx
// server (mutedKeyword.service.ts): lowercased + idempotent, [F1] builder API
await db.insert(mutedKeyword).values({ userId, keyword: k.toLowerCase() }).onConflictDoNothing()
// client (settings.tsx): optimistic add/remove chips — see Prescriptive Patterns below
```
> Answer key — `ai:src/server/actions/Database/services/mutedKeyword.service.ts`
> Watch-out — Do not apply global filters; this is a personal view layer. Ensure `queries.ts` uses the viewer's ID for exclusion.

### 4. Blocked Users
> Feature — List blocked users with ability to unblock.
> Rules — Standard block list. Unblocking is the primary mutation. Reading returns rows directly.
> Pattern — Service List/Action. Delegates to `block.service`. [P4].
> Data — `userBlock`.
> Connections — Feed filtering (should exclude blocked actors — see [P4] watch-out: not yet enforced).
> Hint —
```tsx
// src/routes/_authenticated/settings.tsx
const { data: blocked } = useQuery({
  queryKey: ["blockedUsers"],
  queryFn: getBlockedUsersFn
});
const { mutate: unblock } = useMutation({ mutationFn: unblockUserFn });
```
> Answer key — `ai:src/server/actions/Database/services/block.service.ts`
> Watch-out — Ensure `block.service` handles self-blocking or double-blocking gracefully.

### 5. Role Keys
> Feature — Generate, redeem, and inspect site-role keys.
> Rules — Site-role gated. Detailed lifecycle defined in [P5] (generate -> share -> redeem).
> Pattern — Admin Resource Management. Standard CRUD with business logic constraints. [P5].
> Data — `roleGrant` (the hashed key) + `siteRole` (the grant); full lifecycle in [P5].
> Connections — Site-role assignment ([P5]).
> Hint —
```tsx
// src/routes/_authenticated/settings.tsx
const { mutate: generate } = useMutation({ mutationFn: createRoleKey });
const { data: keys } = useQuery({ queryKey: ["roleKeys"], queryFn: listRoleKeys });
```
> Answer key — `ai:src/routes/_authenticated/settings.tsx`
> Watch-out — Ensure single-use or expiration logic is enforced in the service.

### 6. Verify / Moderator Tools
> Feature — Moderator search + verify toggle for privileged users.
> Rules — Gated by `site-role` (see [P5]). Allows searching users and toggling verification flags.
> Pattern — Privileged Action. Requires role check on client/server. [P5].
> Data — User profile (flags/roles).
> Connections — User Profile Read-view (renders badge).
> Hint —
```tsx
// src/routes/_authenticated/settings.tsx
if (!hasSiteRole("moderator")) return null;
const { mutate: verify } = useMutation({
  mutationFn: (uid) => setVerifiedFn({ data: { userId: uid, verified: true } })
});
```
> Answer key — `ai:src/routes/_authenticated/settings.tsx`
> Watch-out — Search performance on large userbases may need debouncing.

## Prescriptive Patterns

**Optimistic Updates (Settings)**
Settings toggles affect lists/cache state ([P7]). Do not use `useOptimistic` (which is for single booleans like likes). Use the TanStack Query `onMutate` sequence to ensure UI updates instantly while the server commits.

```tsx
// src/routes/_authenticated/settings.tsx
onMutate: async (newData) => {
  await cancelQueries(['prefs']);
  const prev = getQueryData(['prefs']);
  setQueryData(['prefs'], old => ({ ...old, ...newData }));
  return { prev };
},
onError: (err, vars, context) => setQueryData(['prefs'], context.prev),
onSettled: () => invalidateQueries(['prefs'])
```

## Watch-Outs

1. **Direct Writes**: `collab_invite`, `moderation`, and `system` notifications bypass the standard coalescing/opt-out writer described in [F5].
2. **Copy Tone**: Strictly adhere to "Off just means quieter — nothing is deleted or hidden from anyone else".
3. **Read Side**: Muted keywords MUST be applied at the query layer (`queries.ts` [F1]), not the mutation layer.