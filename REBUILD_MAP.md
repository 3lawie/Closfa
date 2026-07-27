# Closfa — Rebuild Map

A guided map for re-implementing, **by hand**, the features the AI branch added — learning the correct pattern for each instead of discovering them one by one over weeks.

## Why this exists

You keep two branches on purpose:

- **`main`** — your handwritten baseline. AI was only a hint. You already understand this code.
- **`ai`** — where the AI polished and finished the app. High quality, densely commented, but you didn't type it, so you don't *own* it yet.

Confirmed fact: `git merge-base main ai == main tip`. **`main` is frozen at the pre-AI point and `ai` is strictly ahead**, so the entire `main → ai` diff (164 files, +22,260 / −5,434) *is* the AI's contribution. This map turns that diff into a curriculum: for each feature, the **rules** that force a correct build, the **best pattern** to reach for, a short **hint**, and a pointer to the AI file as an **answer key** you check *after* you attempt it.

Both branches stay exactly as they are. This map is documentation. When you port a feature, do it on a fresh branch of your choosing — the map never edits `main` or `ai`.

## How to use it

1. **Read the five foundations first** ([F1]–[F5] in `docs/rebuild/foundations/`). They state each shared rule once; every feature cites them by tag. You reach for these constantly, so internalize them before building surfaces.
2. **Pick a page** from `docs/rebuild/features/` ([P1]–[P7]). Each page lists its required features.
3. **For each feature: read the *Rules* and *Pattern*, then write it yourself** against `main`'s schema — do not open the answer key first. The rules are designed to be sufficient.
4. **Only then diff against the answer key** (`ai:<path>`). If you needed the file to get it right, that entry was under-specified — tell me and I'll deepen its rules. That feedback loop is the point: the map should *teach*, not just *describe*.
5. **Heed the *Watch-out* lines.** Where the AI branch did something a lesser way (raw `console.error`, a hand-rolled result shape, a pre-React-19 idiom), the map prescribes the better version and marks the AI code as "acceptable but supersede." Don't copy drift.

## The entry template

Every feature/pattern entry follows one shape:

> **Feature** — one-line purpose.
> **Rules** — the invariants that force a correct build (*"one like per user per post"*, *"a ban takes effect on the next request"*). This is the real content.
> **Pattern** — the named base pattern to reach for, prescribed as best practice; cites a foundation, e.g. **[F3] idempotent toggle**.
> **Data** — tables/columns/counters touched.
> **Connections** — what it fans out to (e.g. like → **[F5]** notification).
> **Hint** — a ≤10-line skeleton showing the *shape*, never the full body.
> **Answer key** — `ai:<path>` to diff against.
> **Watch-out** — drift or unfinished parts to improve on.

## Build order

Foundations, then pages in dependency order (each page reuses foundations + earlier pages):

```
F1 Runtime & Data  →  F2 Auth & Session  →  F3 Server Contract  →  F4 Media  →  F5 AI & Awareness
        │
        ▼
P1 Feed/Home → P2 Post & Comments → P3 Create/Manage → P4 Profile/Social
             → P5 Moderation/Roles → P6 Notifications/Settings → P7 Design System
```

## Map contents

| Tag | File | Covers |
|---|---|---|
| — | `docs/rebuild/00-diff-overview.md` | The full `main → ai` gap, keyed to `MODERNIZATION_PLAN.md` phases |
| **F1** | `foundations/F1-runtime-and-data.md` | Edge limits · 26-table schema as a data story · ORM two-API rule · pagination choice |
| **F2** | `foundations/F2-auth-and-session.md` | Auth0 PKCE (BFF) · JWE cookie · decrypt-once middleware chain |
| **F3** | `foundations/F3-server-contract.md` | `ServerResult` · Zod validation triangle · verifiers · rate-limit tiers · CSRF · idempotent toggle |
| **F4** | `foundations/F4-media-pipeline.md` | Client workers · IndexedDB staging · ImageKit signed upload · read transforms |
| **F5** | `foundations/F5-ai-and-awareness.md` | RAKE · search-click learning · Whisper/Llama · the aware-intention data model |
| **P1** | `features/P1-feed-and-home.md` | For-You/Following · infinite scroll · scroll-break · keyboard-first feed |
| **P2** | `features/P2-post-and-comments.md` | Post detail/modal · like · comment/reply · save · share · report · mention · view |
| **P3** | `features/P3-create-and-manage-post.md` | Create pipeline · my-posts · resubmit · collab invites · own-visibility |
| **P4** | `features/P4-profile-and-social.md` | Profile · follow/block · pin · edit-profile · moderation team |
| **P5** | `features/P5-moderation-and-roles.md` | Reports · audit · ban/warn · profile roles + site roles + redeemable keys |
| **P6** | `features/P6-notifications-and-settings.md` | Notifications drawer/prefs · muted keywords · blocked users · verify |
| **P7** | `features/P7-design-system-and-theming.md` | `@theme` tokens · primitives · optimistic-UI pattern · OKLCH light/dark |

## Pattern quick-reference

The reusable hints, each defined once and cited everywhere:

| Pattern | Defined in | One-line rule |
|---|---|---|
| `ServerResult<T>` contract | F3 | Expected failures are values `{ok:false,…}`; throw only for infra faults |
| Validation triangle | F3 | Every server fn has `.inputValidator(zodSchema)`; schema shared with the client form |
| Decrypt-once session | F2 | The JWE is decrypted one time per request by `sessionMiddleware`; handlers read `context.session` |
| Defense in depth | F2/F3 | The middleware chain is the *only* security boundary; route guards are cosmetic |
| ORM two-API rule | F1 | Relational reads = object filters; builder writes = `eq()/and()`. Never mix; never `as any` |
| Idempotent toggle | F3 | `unique(x_id,user_id)` + `DELETE`-or-`onConflictDoNothing()` INSERT + `GREATEST(c-1,0)` counter |
| Keyset vs offset paging | F1 | Offset for rank-on-mutating-`likes` (For-You); keyset cursor for stable order (Following) |
| `waitUntil` background jobs | F3 | Post-response work (enrichment, purge) must be handed to `waitUntil` or the edge kills it |
| Optimistic UI | P7 | React 19 `useOptimistic` + `useReducer` (prescribed) — instant flip, exact rollback, reconcile |
| Loader + `initialData` SSR seed | P1 | Loader fetches page 1 server-side; the client query is seeded so there's no loading flash |
| Worker + OffscreenCanvas + idle | F4 | Heavy media work runs off-main-thread, gated by an idle scheduler, correlated by `id` |
| Token theming | P7 | `@theme` bridges bare OKLCH vars into Tailwind utilities; `.dark` overrides the same names |
| Coalesced/opt-out notify | F5 | `createNotification` skips self, honors per-type opt-out, coalesces unread same-type rows |

## Guardrails (non-negotiable, from `CLAUDE.md` + `DESIGN_PATTERNS.md`)

1. Session decryption happens **once**, in the middleware chain. (F2)
2. **ORM API separation** — never mix relational and builder filter syntax; never `as any` a filter error. (F1)
3. Every server function **validates input** with a shared Zod schema. (F3)
4. Expected failures return a **structured `ServerResult`**; throws are for infrastructure faults. (F3)
5. Authorization checks are **pure functions** that receive the session; ownership is verified before writes. (F3)
6. **Edge runtime only** — Web APIs and edge-compatible libraries; no Node-only APIs. (F1)

## Status legend for gaps

Where `main`'s plan wanted a feature the AI never finished, its entry is marked:

- **`planned · not built`** — in the plan, no code (e.g. Stripe subscription, edit-post).
- **`partial`** — code exists but a rule isn't enforced yet (e.g. block written but not applied to feed reads).
- **`drift`** — built, but in a way to improve on (e.g. `savedPost` hand-rolls the result shape).

See `00-diff-overview.md` for the full inventory keyed to plan phase numbers.
