---
name: web-design-patterns
description: Modern web application patterns for TanStack Start — route-level data loading, streaming, caching and invalidation, optimistic UI, pagination, error/loading states, form flows. Consult when building or refactoring any route, data flow, or user-facing interaction, or when the user asks "what's the modern way to do X on the web".
---

# Web Design Patterns (TanStack Start edition)

The app-flow rulebook: how data and interaction should move through a modern TanStack Start app. `/patterns` covers Closfa's server conventions; this skill covers the web layer on top. When both apply, read both.

## Data loading

- **Route loaders own initial data.** Data a page needs on arrival loads in the route's `loader`, not in a component `useEffect`/`useQuery` waterfall. Components fetch only what appears after interaction.
- **Stream what's slow, block what's cheap.** Critical shell data blocks; below-the-fold or slow queries stream with `Suspense` boundaries + skeletons (`PostCardSkeleton.tsx` is the house style).
- **One query key convention.** `['entity', id]` for items, `['entity', 'list', params]` for collections. Mutations invalidate the narrowest key that covers the change — never `invalidateQueries()` with no key.
- **Pagination = cursor, not offset.** Feeds paginate by cursor (created_at + id tiebreaker) with `useInfiniteQuery`; offset pagination breaks under inserts and gets slow on deep pages.

## Mutations & optimistic UI

- **Cheap + reversible → optimistic** (like, follow): update the cache immediately, roll back on `{ ok: false }`.
- **Costly or identity-bearing → pessimistic** (create post, delete, payment-ish): spinner on the button, update after server confirms.
- Every mutation handles all three `ServerResult` outcomes in the UI: pending, ok, and error with the server's `message` inline — never a silent failure or a raw stack trace.
- Form state survives failure: never clear inputs before `ok: true`.

## States are features

Every list/detail surface ships four states or it isn't done: **loading** (skeleton mirroring final layout — no layout shift), **empty** (what it is + the action to fill it), **error** (what failed + retry), **content**. Grep for a missing state before calling a page complete.

## Navigation & flow

- Auth redirects carry a return path — post-login lands where the user intended.
- Destructive actions confirm; the confirm names the consequence ("Delete post? This cannot be undone.").
- URL is state: filters, tabs, and pagination live in search params (TanStack Router's typed `validateSearch`), so every view is linkable and survives refresh.

## Handoffs (skill chaining)

- Designing a new feature's flow from scratch → start with `/system-design`; this skill then details each route it produced.
- Visual execution of these flows → `/creative-ui`.
- Server-side counterpart of any rule here → `/patterns` (validation, ServerResult, middleware).
- Done building → `/full-review` (the ux-reviewer agent checks against exactly these rules).
