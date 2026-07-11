---
name: recurring-defects
description: Repeated line-level defect patterns to check first in Closfa code reviews
metadata:
  type: project
---

Recurring defect patterns observed in Closfa working-tree reviews.

**Drizzle relational-filter `as any`** — invariant 2 ("never silence a filter type error with `as any`") is violated repeatedly on `db.query.X.findFirst({ where: { col: val } as any })`. Live spots (as of 2026-07-11): `comment.service.ts` (delete path), `permissions.ts`, `queries.ts`. **Why:** Drizzle-beta relational `where` typing is awkward, so authors reach for `as any`. **How to apply:** flag each as a type-honesty finding; the documented fix is a typed query helper (`queries.*`) — `post.service.deletePost` was migrated to `queries.post.getById()` and dropped its cast, so that's the exemplar to point at.

**`npm run lint` is currently red** — the repo has ~21 standing ESLint errors (the `as any` above plus unused vars, `react-hooks/rules-of-hooks` in `useMediaQuery.ts`, `set-state-in-effect`). **How to apply:** any change that adds a CI workflow running `npm run lint` as a blocking step is dead-on-arrival — call it out. Verify by actually running `npm run lint`, not by trusting "tests pass" (tests and lint are independent gates here). `npx tsc --noEmit` DOES pass clean, so typecheck green ≠ lint green.
