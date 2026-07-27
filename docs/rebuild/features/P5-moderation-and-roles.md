# P5 — Moderation & Roles

## Routes & Data Loading
- **Layout**: `/dashboard` renders `DashboardTabs` + `<Outlet />`.
- **Overview**: `/dashboard/` loads stats + pending reports. Supports resolve actions inline.
- **Post Control**: `/dashboard/posts` loads admin post list (approve/send-back/delete).
- **Redirect**: `/moderator` is a stub redirecting to `/dashboard`.
- **Loader Pattern**: Loaders use `Promise.all` aggregating stats, reports, and posts. Strategy is **fail-soft**: if a fetch throws/unauths, return `null`. The component checks for `null` to prevent mounting unauthorized panels. Data is passed to `useQuery` via `initialData` ([P1]).

## RBAC Architecture
Authorization relies on two parallel, live-read ladders. Do not cache permissions in session tokens; `getProfilePermission` and `getGlobalPermission` must query the DB on every check.

1.  **Profile-scoped**: `profileMember` + `profileRoleEnum`.
    -   Hierarchy: `moderator(1)` < `vip_moderator(2)` < `co_owner(3)` < `owner(4)` (implicit).
2.  **Site-wide**: `siteRole` + `siteRoleEnum`.
    -   Hierarchy: `moderator(1)` < `senior_moderator(2)` < `admin(3)` < `owner(4)`.
-   **Capabilities**: Derived from level thresholds ([F3]).

> **Note on the hints below** — they are schematic. Every real write uses the [F1] Drizzle *builder* API (`db.insert(x).values(...)`, `db.update(x).set(...).where(eq(...))`, `db.delete(x).where(...)`), never a Prisma-style `db.table.update({ where, data })`. Open the answer-key file for the exact calls.

***

### Feature 1 — Report content submission
>**Purpose** Allow users to report entities with integrity and anonymity.

>**Rules**
1.  Verify Turnstile token **before** any DB write; fail closed if missing/invalid ([F2]/[F3]).
2.  Row must be polymorphic (`targetType`, `targetId`).
3.  Notification metadata must set `actorId=null` to prevent retaliation.

>**Pattern** Input Guard ([F3]) + Polymorphic Insert.

>**Data**
-   `report` table (insert).
-   `notification` table (insert, derived).

>**Connections**
-   Fans out to Report Queue (Feature 2).

>**Hint**
```typescript
// ai:src/server/actions/Database/services/moderation.service.ts
async reportContent(input) {
  await verifyTurnstile(input.token); // Fail closed
  await db.report.insert({
    targetType: input.type,
    targetId: input.id,
    reason: input.reason
  });
  await notifyAdmins({ /*..., actorId: null */ });
}
```

>**Answer key**
`ai:src/server/actions/Database/services/moderation.service.ts`

>**Watch-out**
None explicitly stated.

***

### Feature 2 — Report queue & resolution
>**Purpose** Fetch pending reports for review and execute disposition actions.

>**Rules**
1.  Access gated by `canReviewReports` capability.
2.  `resolveReportFn` must branch on action type (`delete`, `dismiss`, `ban_user`, `warn_user`), checking specific capabilities for each.
3.  Previews for reported targets must be batch-fetched via `inArray` to avoid N+1 queries ([F1]).
4.  Audit log entry required on every resolution.

>**Pattern** Capability Gate ([F3]) + Batch Fetch ([F1]) + Branching Logic.

>**Data**
-   `report` table (read/update).
-   `user` / `post` tables (batch read via inArray).
-   `auditLog` table (insert).

>**Connections**
-   Inputs to Ban/Warn (Feature 4).
-   Inputs to Audit Log (Feature 3).

>**Hint**
```typescript
// ai:src/routes/_authenticated/dashboard.index.tsx
export async function loader() {
  const perm = await getGlobalPermission(userId);
  if (!perm.canReviewReports) return null; // Fail-soft
  const [reports, targets] = await Promise.all([
    db.report.findMany({ where: { status: 'pending' } }),
    db.post.findMany({ where: { id: { in: reports.map(r=>r.targetId) } } })
  ]);
  return { reports, targets };
}
```

>**Answer key**
`ai:src/routes/_authenticated/dashboard.index.tsx`

>**Watch-out**
**Drift**: No dedicated flagged-content UI; flagged posts re-use the pending reports queue.

***

### Feature 3 — Audit log
>**Purpose**Immutable record of all privileged actions for accountability.

>**Rules**
1.  Mandatory write on **every** privileged mutation (resolution, role changes, bans, deletes).
2.  Must include `actorId`, `action` enum, `targetType`/`targetId`, and `reason`.

>**Pattern** Side-effect Writer ([F1] - implies strict schema/fk).

>**Data**
-   `auditLog` table (insert).

>**Connections**
-   Connected to all mutation features (2, 4, 5, 6, 7, 9).

>**Hint**
```typescript
// ai:src/server/actions/Database/services/role.service.ts
async logAction(actorId, action, target, reason) {
  await db.auditLog.create({
    data: { actorId, action, targetType: target.type, targetId: target.id, reason }
  });
}
```

>**Answer key**
`ai:src/server/actions/Database/services/moderation.service.ts`

>**Watch-out**
None explicitly stated.

***

### Feature 4 — Ban / warn a user
>**Purpose** Enforce site rules by restricting access or warning users.

>**Rules**
1.  Ban flips `user.isBanned` column.
2.  Middleware must read `user.isBanned` live on subsequent requests to enforce restriction immediately ([F2]).
3.  Warn writes a notification record; does not change user state.

>**Pattern** State Mutation + Live Middleware Read ([F2]).

>**Data**
-   `user` table (update).
-   `notification` table (insert, for warn).

>**Connections**
-   Triggered by Report Queue (Feature 2).

>**Hint**
```typescript
// ai:src/server/actions/Database/services/moderation.service.ts
async banUser(targetId, reason) {
  await db.user.update({ where: { id: targetId }, data: { isBanned: true } });
  // Middleware checks user.isBanned on next req
}
```

>**Answer key**
`ai:src/server/actions/Database/services/moderation.service.ts`

>**Watch-out**
None explicitly stated.

***

### Feature 5 — Assign / remove profile moderators
>**Purpose** Manage hierarchical roles within a profile context.

>**Rules**
1.  **Escalation Guard**: `if (perm.level <= ROLE_LEVELS[role]) throw Exception`. You cannot grant or remove roles at or above your own level.
2.  Exception: Self-removal is permitted.
3.  Role string must be Zod-validated against `profileRoleEnum`.

>**Pattern** Escalation Guard ([F3]) + Enum Validation.

>**Data**
-   `profileMember` table (update role/delete row).

>**Connections**
-   UI: ManageTeamModal ([P4]).

>**Hint**
```typescript
// ai:src/server/actions/Database/services/moderation.service.ts (Drizzle builder)
if (perm.level <= ROLE_LEVELS[role] && myUserId !== targetUserId)
  return err('FORBIDDEN', 'cannot assign/remove a role >= your own') // self-removal allowed
await db.insert(profileMember).values({ profileId, userId, role, assignedBy: myUserId })
  .onConflictDoUpdate({ target: [profileMember.profileId, profileMember.userId], set: { role } })
```

>**Answer key**
`ai:src/server/actions/Database/services/moderation.service.ts` (`assignModerator` / `removeModerator`)

>**Watch-out**
None explicitly stated.

***

### Feature 6 — Site roles via redeemable keys
>**Purpose** Securely grant site-wide roles via single-use tokens.

>**Rules**
1.  `generateRoleKeyFn`: Create random key, store **only** `SHA-256` hash (`codeHash`). Return plaintext **only once**.
2.  `redeemRoleKeyFn`: Must pass strict `rateLimiterMiddlewareFor('roleRedeem')` tier ([F3]).
3.  **Atomic Claim**: Single `UPDATE ... WHERE codeHash=? AND redeemedAt IS NULL AND expiresAt > NOW() RETURNING *`. Guarantees single-use without explicit transactions ([F1]).
4.  **Grant**: Separate insert after claim.
5.  **Owner Rule**: Owner role cannot be granted/revoked via endpoints (enforced by DB CHECK + unique index [F1]).
6.  Role level re-read from `roleGrant` row, never trusted from client code string.

>**Pattern** Atomic Update-Return ([F1]) + Rate Limiting ([F3]) + Hashing.

>**Data**
-   `roleGrant` table (the hashed key; claimed via `UPDATE … RETURNING`).
-   `siteRole` table (the actual role grant, inserted after a successful claim).

>**Connections**
-   None explicitly listed (other than user state).

>**Hint**
```typescript
// ai:src/server/actions/Database/services/role.service.ts
// atomic single-UPDATE claim — how single-use is guaranteed without transactions
const [claimed] = await db.update(roleGrant)
  .set({ redeemedBy: userId, redeemedAt: new Date() })
  .where(and(eq(roleGrant.codeHash, hash), isNull(roleGrant.redeemedAt),
             gt(roleGrant.expiresAt, new Date())))
  .returning()
if (!claimed) return err('BAD_REQUEST', 'invalid, expired, or already used')
await db.insert(siteRole).values({ userId, role: claimed.role, assignedBy: userId }) // role from the row
```

>**Answer key**
`ai:src/server/actions/Database/services/role.service.ts`

>**Watch-out**
**Ops Branch**: If "claim succeeded but grant insert failed", do **not** roll back the claim. Log for manual recovery.

***

### Feature 7 — Assign global moderator directly
>**Purpose** Direct promotion to site moderation roles without keys.

>**Rules**
1.  Function `assignGlobalModeratorFn`.
2.  Level restricted strictly to `moderator` or `senior_moderator`.

>**Pattern** Capability Check ([F3]) + Insert.

>**Data**
-   `siteRole` table (insert/upsert).

>**Connections**
-   UI: ManageTeamModal ([P4]).

>**Hint**
```typescript
// ai:src/server/actions/Database/services/role.service.ts
// role is Zod-limited to moderator | senior_moderator ([F3] validation)
await db.insert(siteRole).values({ userId, role, assignedBy: myUserId })
  .onConflictDoUpdate({ target: siteRole.userId, set: { role } })
```

>**Answer key**
`ai:src/server/actions/Database/services/role.service.ts`

>**Watch-out**
None explicitly stated.

***

### Feature 8 — Verify a user
>**Purpose** Mark a user profile as verified.

>**Rules**
1.  `setVerifiedFn` toggles `profile.isVerified`.
2.  Treated as a site-role action.
3.  Badge rendering handled downstream ([P4]).

>**Pattern** Boolean Toggle + Capability Check ([F3]).

>**Data**
-   `profile` table (update).

>**Connections**
-   UI: ManageTeamModal renders badge.

>**Hint**
```typescript
// ai:src/server/actions/Database/services/role.service.ts
await db.profile.update({
  where: { userId },
  data: { isVerified: !currentStatus }
});
```

>**Answer key**
`ai:src/server/actions/Database/services/role.service.ts`

>**Watch-out**
None explicitly stated.

***

### Feature 9 — Post moderation state machine
>**Purpose** Manage post lifecycle through approval, soft-delete (send back), and hard purge.

>**Rules**
1.  `approvePostFn`: Moves state `pending` -> `published`.
2.  `adminSoftDeletePostFn`: Moves state to `draft` (or equivalent "held" state), sets `moderationReason`. Reuses `deletePostRecord` logic. Allows 3-day undo ([F5]).
3.  `adminCompleteDeletePostFn`: Moves state to `removed`, sets `scheduledPurgeAt`.

>**Pattern** State Machine + Undo Buffer ([F5]).

>**Data**
-   `post` table (update state, reason, purgeDate).

>**Connections**
-   UI: `/dashboard/posts` list.

>**Hint**
```typescript
// ai:src/server/actions/Database/services/post.service.ts
if (action === 'soft_delete') {
  return db.post.update({ 
    data: { post_status: 'draft', is_published: false, moderationReason: reason }
  });
}
// soft-delete maintains 3-day undo window via F5
```

>**Answer key**
`ai:src/server/actions/Database/services/post.service.ts`

>**Watch-out**
None explicitly stated.