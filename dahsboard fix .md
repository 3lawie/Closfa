# Dashboard Fix Details

This document explains the database migration conflicts and client-side bundling issues encountered on the dashboard route and how they were resolved.

---

## 1. Database Schema Conflict & Foreign Key Block

### The Problem
When running the schema sync (`npm run db:push`), Drizzle-Kit threw:
`query error: type "site_role" already exists`

In PostgreSQL, creating a table implicitly registers a composite type of the same name. Since a custom enum type named `site_role` already existed, Postgres rejected creating a table of the same name.
- Trying to run `DROP TYPE site_role;` directly failed because the `role_grant` table's `role` column depended on it, and a check constraint (`role_grant_not_owner`) checked its values.
- In addition, there was an orphaned row in the `saved_post` table pointing to a non-existent post, which blocked the application of the new `saved_post_post_id_post_post_id_fkey` foreign key constraint.

### How It Was Solved
1. **Cleared the dependencies**: We temporarily dropped the check constraint `role_grant_not_owner` from the database.
2. **Migrated the data type**: We altered the `role_grant.role` column to use the new `site_role_type` enum (casting the existing values):
   ```sql
   ALTER TABLE "role_grant" ALTER COLUMN "role" SET DATA TYPE "site_role_type" USING "role"::text::"site_role_type";
   ```
3. **Dropped the old type**: With all references removed, we safely dropped the old `site_role` enum type.
4. **Cleaned up orphaned records**: We deleted the single invalid row in `saved_post` that had an invalid `post_id`.
5. **Pushed schema**: We ran `npm run db:push` again, which successfully created the `site_role` table, set up all foreign keys, and recreated the `role_grant_not_owner` check constraint pointing to the correct type.

---

## 2. Client-Side `DATABASE_URL` Console Error

### The Problem
In TanStack Start, route files (like `src/routes/_authenticated/dashboard.tsx`) are included in client-side bundles to handle client-side routing, navigation, and hydration.

The dashboard loader was directly importing and calling database queries:
```typescript
import { queries } from '@/server/queries'

// ...
const [followers, following, posts] = await Promise.all([
  queries.follow.getFollowers(userId).catch(() => []),
  // ...
])
```
Because the client bundle static-imported `queries.ts`, it also imported the database proxy `src/server/db/index.ts`. When evaluated in the browser, the proxy threw `DATABASE_URL is not set in the environment` because the database connection string is a server-only secret and is `undefined` in the browser.

### How It Was Solved
We moved the direct database reads out of the client bundle:
1. **Server Function Wrapping**: We introduced a server function `getDashboardStatsFn` that runs strictly on the server:
   ```typescript
   const getDashboardStatsFn = createServerFn({ method: 'GET' })
     .middleware([authMiddleware])
     .handler(async ({ context }) => {
       const userId = context.session.userId
       const { queries } = await import('@/server/queries') // Dynamic import
       
       const [followers, following, posts] = await Promise.all([
         queries.follow.getFollowers(userId).catch(() => []),
         queries.follow.getFollowing(userId).catch(() => []),
         queries.post.getIdsByAuthor(userId).catch(() => []),
       ])
       return { followers: followers.length, following: following.length, posts: posts.length }
     })
   ```
2. **Dynamic Imports**: By using `await import('@/server/queries')` *inside* the handler, we prevented the compiler from statically pulling `queries` (and thus `db`) into the route file's imports.
3. **Compiler Stripping**: When TanStack Start bundles the client code, it completely strips the `.handler(...)` block of `createServerFn`. This removes the dynamic import entirely, ensuring **zero** database code lands in the browser.
4. **Loader Refactor**: We updated the route loader to call `getDashboardStatsFn()` concurrently with `getPendingReportsFn()` using `Promise.all` for fast, parallel execution.

---

## 3. Feed Load Failure (Missing Column)

### The Problem
When loading the Home Feed or viewing a user profile, the UI displayed "Couldn't load the feed" or "User Not Found". Under the hood, the server query threw the following error:
```bash
NeonDbError: column d2.hide_engagement_counts does not exist
```
This occurred because the Drizzle schema in `src/server/db/schema.ts` had been updated to define a new `hideEngagementCounts` column on the `profile` table, but the remote database schema had not yet been updated to match it.

### How It Was Solved
We synchronized the schema using:
```bash
npm run db:push
```
This successfully executed `drizzle-kit push`, adding the `hide_engagement_counts` column and constraints to the remote PostgreSQL database.

---

## 4. Post Creation Failure (Missing User Columns)

### The Problem
When trying to publish a new post from the `/create` page, the database query failed with the following error:
```bash
Failed query: select "is_banned" from "user" where "user"."user_id" = $1 limit $2
```
This occurred because the `user` table in the remote database was missing the `is_banned`, `banned_at`, and `ban_reason` columns defined in `src/server/db/schema.ts`.

### How It Was Solved
We ran:
```bash
npx drizzle-kit push
```
Drizzle Kit successfully detected the schema diff and applied the missing columns to the `user` table in PostgreSQL:
* `is_banned` (boolean, default false)
* `banned_at` (timestamp)
* `ban_reason` (text)

After updating the database, creating and publishing posts works correctly without any query errors.

---

## 5. Media Duration Zod Validation Error (Float vs. Integer)

### The Problem
When trying to publish a post containing video or audio files, the Zod input validator threw a validation error:
```json
[
  {
    "expected": "int",
    "format": "safeint",
    "code": "invalid_type",
    "path": ["media", 0, "duration"],
    "message": "Invalid input: expected int, received number"
  }
]
```
This happened because:
1. The browser's HTML5 `<video>` and `<audio>` elements return duration as a floating-point number (e.g. `3.123` seconds).
2. The Zod schema validator enforced that `duration` must be a strict integer (`z.number().int()`), while the database holds duration as an integer of seconds.

### How It Was Solved
We implemented rounding in both the client-side code and server-side validation schemas to handle decimals gracefully:
1. **Client-side**: In `src/routes/_authenticated/create.tsx`, we round the duration before sending:
   ```typescript
   duration: typeof duration === 'number' ? Math.max(1, Math.round(duration)) : undefined,
   ```
2. **Server-side**: In the Zod schema definitions (`post.service.ts` and `Post.ts`), we replaced `z.number().int().positive()` with a validator that accepts any positive number and rounds it to a safe integer:
   ```typescript
   duration: z.number().positive().optional().transform(val => val !== undefined ? Math.max(1, Math.round(val)) : undefined),
   ```
This prevents floating-point duration numbers from breaking post creation.



