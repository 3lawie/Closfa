# UX Flow Review — Closfa (whole-app pass)

Reviewed against `.claude/skills/web-design-patterns/SKILL.md` and the ux-reviewer checklist. Findings are user-impact statements. This app is meant to feel calm and honest, so I weight fake feedback and dead ends heavily.

## Findings

**1. Feed has no error state — `FeedList.tsx:137-202`**
When the initial feed fetch fails (rate limit, network, server throw from `getFeedFn`), the user sees the skeleton resolve into… nothing, or an infinite skeleton. `activeQuery.isError` is never rendered — only `isLoading`, empty, and content branches exist. The four-states rule (loading/empty/**error**/content) is broken on the primary surface. **Fix:** add an `isError` branch with the server `message` + a "Try again" button wired to `activeQuery.refetch()`. Severity: **Should fix.**

**2. Infinite scroll has no retry on a failed page — `FeedList.tsx:157-160`, `useInfiniteScroll.ts:43`**
When scrolling and a `fetchNextPage` fails, the user sees the load skeleton vanish with no error and no way to retry; the observer may also silently re-fire. The checklist explicitly requires "a retry affordance on failed pages." **Fix:** when `activeQuery.isError && activeQuery.data`, render a "Couldn't load more — Retry" row instead of the sentinel, and stop observing while errored. Severity: **Should fix.**

**3. Likes are faked — no server call, no persistence, no rollback — `PostCard.tsx:154-164`**
When the user likes a post, the heart fills and the count bumps, but `handleLike` only mutates local `useState`. On refresh or navigation the like is gone. This is exactly the "honest where it matters" violation the product thesis warns against — the UI confirms an action that never happened. **Fix:** back it with a `useMutation` that optimistically updates the `['feed', ...]` cache and rolls back on `{ ok: false }` (the pattern the skill prescribes for cheap+reversible). Severity: **Should fix.**

**4. Create-post is a dead end — `create.tsx:22-24`**
When the user writes a post, adds media, and clicks Publish, nothing happens: `handlePublish` is a `console.log` TODO. The button never disables, shows no pending/success/error, and the media staged in IndexedDB (`MediaContatiner`) is never uploaded or posted. Every mutation-feedback rule is unmet here because the mutation doesn't exist yet. **Fix:** wire the batch upload → create-post server fn, disable Publish while pending, surface the `ServerResult` message, and only navigate away on `ok: true`. Severity: **Should fix.**

**5. No path to the composer — `Navbar.tsx` (whole file)**
When a logged-in user wants to post, there is no link to `/create` anywhere in the UI (grep confirms zero references). The composer is unreachable except by typing the URL. **Fix:** add a "New post" action to the Navbar for authenticated sessions. Severity: **Should fix.**

**6. Comment link 404s — `PostCard.tsx:234`**
When the user taps the comment icon, they navigate to `/post/${postId}`, which has no route (confirmed — no `post` route file exists). They hit a not-found. The `as '/'` cast is hiding the type error that would otherwise catch this. **Fix:** build the post-detail route or disable the link until it exists; drop the cast. Severity: **Should fix.**

**7. Auth redirects carry no return path — `_authenticated.tsx:5-16`, `auth0.ts:164-185`, `auth0.service.ts:44`**
When an unauthenticated user opens `/dashboard` or `/create`, they're bounced through `/api/auth/login` and, after authenticating, land on `/` (or `/onboarding`) — never back where they intended. The PKCE `state` encodes only CSRF randomness, and `processAuthCallback` returns a hardcoded `'/'`. Both criteria call this out explicitly. **Fix:** capture the intended path (redirect `search.redirect` or a signed value in the state cookie) and return it from `processAuthCallback`. Severity: **Should fix.**

**8. Protected-route bounce gives no reason — `_authenticated.tsx:10-12`, `onboarding.tsx:48-50`**
When a session expires mid-session, the user is silently redirected to Auth0 with no "log in to continue" context — they just find themselves on a login screen. **Fix:** pass a reason/return path and show a short banner on the login entry. Severity: **Consider.**

**9. Onboarding validation isn't inline or shared — `onboarding.tsx:63-116`**
When the nickname is invalid or taken, the error renders as a generic block below the form rather than tied to the field, and the min-length rule is a thrown `Error` string, not a shared Zod schema from `src/verification/` powering both sides. Good news: the typed nickname is preserved on failure (state survives). **Fix:** surface the error with `aria-describedby` on the input and drive both client and server from one shared schema. Severity: **Consider.**

**10. Auth failure and login errors are raw dead ends — `callback.ts:32-36`, `login.ts:14-17`**
When the callback fails, the user gets a plain-text 500 body with no link back into the app; when login setup fails, `login.ts` returns `error.message` **and the stack trace** to the browser. Both are jarring and the stack leak is a security smell too. **Fix:** redirect to a friendly in-app error surface with a "Try again" link; never emit stacks to the client. Severity: **Should fix** (stack leak), **Consider** (callback dead end).

**11. Media validation uses `alert()` — `MediaContatiner.tsx:79-84`; orphaned `ImageUploader` uses `alert()`/`console.log` — `ImageUploader.tsx:45,71`**
When a file is too large or an unsupported type, the user gets a blocking browser `alert()` instead of inline feedback — off-key for a calm app. `ImageUploader.tsx` also appears unused (create uses `MediaContatiner`) yet carries `alert()` + `console.log`. **Fix:** render rejects inline near the dropzone; delete or reconcile the dead uploader. Severity: **Consider.**

**12. Dashboard shows hardcoded zeros — `dashboard.tsx:23-36`**
Stats are literal `0`s with no loading or empty distinction, so a returning user with activity still sees an empty-looking dashboard. **Fix:** load counts in the route loader; skeleton then real values. Severity: **Consider.**

## App-flow modernization gaps (highest impact)

1. **"For You" uses offset/page pagination — should be cursor-based.** `feed.service.ts:22-26` computes `nextPage = page + 1` and `queries.post.getFeed(limit, page)`. As new posts arrive between page loads (which they will), users get duplicated or skipped posts while scrolling. The Following feed already does cursor (`created_at + id`) correctly — bring For You in line with `useInfiniteQuery` cursor params.

2. **Tab state isn't in the URL.** `FeedList.tsx:47` keeps `activeTab` in `useState`. `/` + "Following" isn't linkable, doesn't survive refresh, and the back button doesn't restore it. Move it to a typed search param via the route's `validateSearch` so the view is shareable and restorable (the skill's "URL is state" rule).

3. **Return path through the whole auth flow (finding 7).** This is the single biggest journey defect: any deep link behind auth throws the user back to the root after login. Threading `redirect` from route → login → PKCE state → callback closes it.

4. **Wire the create-post mutation end to end (findings 4 + 5).** The composer, IndexedDB staging, and ImageKit HMAC upload all exist but aren't connected to a create-post server fn with pending/success/error UI — and there's no entry point to reach it. This is the core "post something" journey and it currently does nothing.

5. **Give the feed its error state and page-retry (findings 1 + 2).** The feed is the app's front door; today a single failed request degrades to a blank or a spinner that never resolves.

## What the flow already does well

The home feed's initial-load path is textbook modern TanStack Start: the route loader fetches the session and the first feed page **in parallel** (`index.tsx:23-30`, `Promise.all`), then seeds `useInfiniteQuery` via `initialData` (`FeedList.tsx:56-58`) so the first screen is server-rendered with real posts and zero loading flash, and only subsequent pages fetch client-side. The `PostCardSkeleton` also mirrors the real card structure closely, so later loads don't shift layout. That's exactly the route-loader-owns-initial-data + skeleton pattern the skill asks for.
