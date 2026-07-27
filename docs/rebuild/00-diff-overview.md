# 00 · The `main → ai` difference

What the AI branch added on top of your handwritten baseline, and how each delta maps to `MODERNIZATION_PLAN.md`. This is the ground truth the rest of the map is built from.

## Branch topology

```
git merge-base main ai  ==  main tip (ab2d016)      ai tip (b2c3586)
        ●───────────────────────────────────────────────●
        main (frozen: your handwritten baseline)         ai (14 commits ahead)
```

`main` has **no** commits that `ai` lacks. Therefore `git diff main ai` = the AI's complete contribution: **164 files changed, +22,260 / −5,434**. The AI branch began at commit `ddd744d` ("first ai fire") and built forward from there.

To see any single piece yourself:
```bash
git diff main ai -- <path>            # what the AI changed in one file
git show ai:<path>                    # the AI version (your answer key)
git log --oneline main..ai            # the 14 AI commits
```

## New backend services (7)

The idempotent-toggle + fan-out shape ([F3]) repeats across most of these.

| File (`src/server/actions/Database/services/`) | Purpose | Guide |
|---|---|---|
| `like.service.ts` | Toggle post like; keep `post.likes` counter honest; notify author | P2 |
| `savedPost.service.ts` | Bookmark/unbookmark; list saved | P2, P6 |
| `block.service.ts` | Block/unblock; list blocked | P4, P6 |
| `collab.service.ts` | Accept/decline co-author invites | P3 |
| `notification.service.ts` | Central coalescing/opt-out notify writer + mention parsing + read/prefs | F5, P6 |
| `role.service.ts` | Site-wide roles: redeemable keys, direct assign, verify | P5 |
| `mutedKeyword.service.ts` | Per-user feed keyword mute | P6 |

## Rewritten services (6)

| File | Δ | What changed | Guide |
|---|---|---|---|
| `post.service.ts` | +533 | create-with-media, soft-delete + 3-day purge, admin moderation state machine, view/share counters, enrichment kickoff | P2, P3 |
| `moderation.service.ts` | +457 | profile mod-team, reports + Turnstile gate, report queue/resolution, pin/unpin, audit log | P5 |
| `comment.service.ts` | +373 | comments + replies, two-level like toggles, mod-aware cascade delete + counter upkeep | P2 |
| `user.service.ts` | +242 | auth-user upsert + owner bootstrap, avatar/profile/display-name, public profile, nickname search | P4 |
| `follow.service.ts` | +79 | idempotent follow/unfollow + notify | P4 |
| `feed.service.ts` | +44 | For-You (offset) / Following (keyset) / search / search-click log wrappers | P1 |

## New server-lib

| File | Purpose | Guide |
|---|---|---|
| `queries.ts` (+407) | ALL read queries in one module; `w()` cast escape hatch; author-name sanitizing; column allowlist | F1 |
| `postEnrichment.ts` | Post-publish background: Whisper → keyword/category/moderation; RAKE fallback | F5 |
| `workersAi.ts` | Workers-AI wrappers (Whisper transcription, Llama moderation/analysis) | F5 |
| `searchClickLearning.ts` | Click-learning: merge query words into `post.keywords` past a threshold | F5 |
| `purgePost.ts` | Dependency-ordered hard-delete; daily cron cleanup after the grace window | F1, P5 |
| `logger.ts` | Edge-safe structured JSON logger | F3 |
| `session.rules.ts`, `rateLimiter.rules.ts`, `auth0.rules.ts` | Pure, unit-tested decision logic split out of their modules | F2, F3 |
| `*.test.ts` (session, result, rateLimiter, turnstile, logger, auth) | Vitest-on-`workerd` tests | F3 |

## New client media / AI stack

| Area | Files | Guide |
|---|---|---|
| Media workers | `src/lib/media/{idleScheduler,thumbnailWorker,videoThumbnail,audioWaveWorker,audioWaveDraw}.ts`, `src/workers/{thumbnail,audioWave}.worker.ts` | F4 |
| Media storage/edit | `src/lib/utils/{mediaDB,imageEdit}.ts` (IndexedDB, non-destructive edits) | F4 |
| Text/keyword | `src/lib/text/{rake,keywordMerge,filenameKeywords}.ts` | F5 |

## Data model — `schema.ts` (+256, now 26 tables)

Grew from a small core to a full social graph. New/expanded groups (walked as a data story in [F1]):

- **Engagement**: `postLike`, `commentLike`, `commentReplyLike`, `savedPost` (idempotent per-user rows) + denormalized counters on `post`.
- **Social graph**: `follow`, `userBlock`.
- **Moderation/roles**: `profileMember` + `profileRoleEnum`, `report`, `auditLog`, `siteRole` (single-owner unique index) + `roleGrant` (hashed one-time keys).
- **Awareness signals**: `notification` + `notificationPreference`, `mutedKeyword`, `searchClick`.
- **Content**: `media` (CHECK-constrained by type), `postToMedia/Category/User`, `comment`/`commentReply`, `categories`; `post` gained `keywords[]`, `transcript`, `scheduledPurgeAt`, `moderationReason`, `media_quality`, and a functional GIN search index.
- **Monetization**: `subscription` (table only — unused).

## New routes (11)

`post.$postId`, `profile.$nickname`, `search`, `api/auth/mock-login`, and under `_authenticated/`: `dashboard.index`, `dashboard.posts`, `moderator`, `my-posts`, `notifications`, `saved`, `settings`.

## New design system

Tailwind v4 `@theme` token bridge (`index.css`), OKLCH light/dark, and primitives: `Button`, `Card`, `Input`, `Modal`, `Toast`, `ConfirmDialog`, `ThemeToggle`, `VerifiedBadge`, `Spinner`; plus the aware-intention UX surfaces. See [P7].

## Deleted

`src/components/layout/Navbar.tsx`, `src/components/media/ImageUploader.tsx`, `src/routes/Todo.tsx` (plan item 25 — debris removal).

## Runtime

Custom `src/worker-entry.ts` (adds a `scheduled()` cron export → `purgeExpiredRemovedPosts`); `wrangler.jsonc` with `nodejs_compat` + the `AI` binding (the **only** binding — no R2/KV) + a daily cron; `vitest.config.ts` on `@cloudflare/vitest-pool-workers`; `.github/workflows/ci.yml`. See [F1], [F4].

---

## Mapping to `MODERNIZATION_PLAN.md`

The plan's own status annotations plus what the code confirms:

| Phase | Items | Status in `ai` |
|---|---|---|
| **P0 Security** | 1–4 (session minting, ImageKit gating, mod escalation, login stack traces) | ✅ Done — each fix carries an inline `security#N` citation |
| **P1 Core flows** | 5–9 (public feed, create end-to-end, real likes, post-detail route, feed error states) | ✅ Built — feed is `optionalAuth`, create pipeline wired, likes persist, `/post/$postId` exists |
| **P2 Architecture rules** | 10–15, 27–28 (validation triangle, `ServerResult`, decrypt-once, pagination+indexes, auth return path, rate-limit tiers, env schema, test runner) | ✅ Largely done — see per-item drift notes below |
| **P3 One UI system** | 16–20 (token bridge, primitives, a11y, dark mode) | ⚠️ Partial — token bridge + primitives + `.dark` shipped; the planned **5-direction bake-off never happened**; `data-theme` multi-personality is scaffolding only |
| **P4 Polish & cleanup** | 21–26 (tab→URL, real dashboard counts, onboarding errors, canonical post status, debris, `.env.example`) | ⚠️ Mixed — debris removed, tabs/counts done; **canonical `post_status` (24) not done** |

## Planned · not built · needs a decision

Fold each into its feature guide as you reach it:

| Gap | State | Where | Plan ref |
|---|---|---|---|
| Stripe subscription / monetization | `planned · not built` — table only | P5-adjacent | (post-plan) |
| Edit-post after publish | `planned · not built` — `updatePostValidation` exists, no endpoint/UI | P3 | — |
| Block enforced in feed/comment reads | `partial` — row written, not applied to visibility queries | P4/P1 | — |
| Canonical post status | `partial` — `post_status`/`is_published`/`published_at` can disagree | P3 | item 24 |
| Whisper end-to-end transcription | `partial` — path was broken until recently, unverified against a real video | F5 | — |
| `CLICK_THRESHOLD = 3` | `drift` — untuned guess | F5 | — |
| Notification coalescing bypass | `drift` — `collab_invite`/`moderation`/`system` inserted directly | F5/P5/P6 | — |
| `savedPost` result shape; `like`/`savedPost` logging | `drift` — hand-rolled result; raw `console.error` not `logger` | P2/P6 | items 10–11 |
| Naming | `drift` — `components/Dahsboard/`, `MediaContatiner.tsx` misspelled | P3/P7 | — |
