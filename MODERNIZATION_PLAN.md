# Closfa Modernization Plan

Ranked from the 2026-07-09 whole-project baseline review (5 reviewers: system, code, security, UI, UX — full reports in `.claude/reviews/2026-07-09-baseline/`). Each phase leaves the app working; do them in order. Findings are cited as `report#` so you can `/teach` any of them.

---

## P0 — Exploitable security (fix before anything else)

1. **Close the session-minting hole.** `createSession` (`src/server/lib/session.ts:172`) is a public `createServerFn` with no middleware — anyone can POST a chosen `userId` and receive a valid session cookie (full account takeover). Convert it (and the cookie-write in `destroySession`) to plain server-only functions with no RPC surface. *(security#1)*
2. **Gate the ImageKit signing endpoints.** Both variants hand out 40-min upload tokens to anonymous callers with no rate limit. Add `authMiddleware + rateLimiterMiddleWare`, drop the unconstrained variant. *(security#2)*
3. **Stop the moderator privilege escalation.** `assignModerator` accepts an unvalidated `role` string; a co_owner can mint more co_owners. Zod-validate against `profileRoleEnum` and require assigner outranks the granted role. *(security#3)*
4. **Stop leaking stack traces from `/api/auth/login`.** Return a generic 500; log server-side. *(security#4, ux#10)*

## P1 — The core product doesn't work (broken flows)

5. **Make the public feed public.** `getFeedFn` carries `authMiddleware`, so every logged-out visitor gets an empty feed — the app's front door is closed to guests. Swap to `optionalAuthMiddleware`; also fixes the double JWE decryption on this path. *(system-blocker, code-blocker)*
6. **Wire create-post end to end.** `handlePublish` is a `console.log` TODO; media staged in IndexedDB is never uploaded; there is no link to `/create` anywhere in the UI. Build the create-post server fn (validated, `ServerResult`), connect the ImageKit batch upload, add pending/success/error UI, and put a "New post" action in the Navbar. *(ux#4, ux#5)*
7. **Make likes real.** The heart is local `useState` only — nothing persists. Add a like server fn + `useMutation` with optimistic cache update and rollback; increment the denormalized counter the feed sorts by (today it ranks on permanent zeros). *(ux#3, system "dead counters")*
8. **Fix the comment link 404.** `PostCard` navigates to `/post/${id}` which doesn't exist (hidden by an `as '/'` cast). Build the post-detail route or disable the link. *(ux#6)*
9. **Feed error + retry states.** No `isError` branch on the primary surface; a failed fetch shows an eternal skeleton or a blank column, and a failed infinite-scroll page vanishes silently. *(ux#1, ux#2, ui FeedList)*

## P2 — Re-establish the architecture's own rules

10. **Validation triangle on every server fn.** Wire the already-written Zod schemas from `src/verification/` via `.inputValidator()` into all ~10 functions using `data as any` / passthrough validators (post, comment, follow, moderation, user, imagekit, feed, onboarding). Let `z.infer` type the handlers. *(code, system, security — the single most repeated finding)*
11. **`ServerResult` for expected failures.** Replace `throw new Error('not found'/'forbidden'/...)` in services with `{ ok: false, error, message }`; `verifyIsOwner` already returns this shape and its result is currently being discarded into a throw. *(code, system)*
12. **Decrypt the session once per request.** Rate limiter re-calls `getSession()`; route loaders re-call it after `beforeLoad`. Pass the session through middleware context / router context so one navigation costs one JWE decryption, as README Rule 1 promises. *(system-blocker#2)*
13. **One pagination strategy + matching indexes.** Move "For You" from offset to the keyset cursor the Following feed already uses; add composite indexes `(is_published, likes, published_at)` and `(author_id, published_at, post_id)` — the hottest queries currently seq-scan. *(system)*
14. **Auth return path.** Thread the intended URL through login → PKCE state cookie → callback so deep links behind auth land where the user meant to go (today: always `/`). *(ux#7)*
15. **Rate-limit the abuse surface.** Only the feed is limited today. Add tiers to auth routes, create/comment/follow/report, nickname claim, ImageKit. Wire the orphaned Turnstile helper into sensitive forms, fail-closed in production. *(security#6, #7)*

## P3 — One UI system instead of three

16. **Bridge tokens into Tailwind (`@theme`).** The root cause of the UI drift: CSS variables exist but aren't Tailwind utilities, so half the app hardcodes `gray/white/amber/blue`. One `@theme` block makes `bg-surface`, `text-body`, `ring-accent` real utilities — everything below depends on it. *(ui-gap#1)*
17. **Rebuild + adopt the primitives.** Button/Input/Card/Spinner are dead code on the wrong palette (amber-as-CTA inverts the token roles; accent is the interactive color). Rebuild on tokens, then migrate onboarding, create, dashboard, uploader, auth buttons onto them. *(ui-gap#2)*
18. **Add missing primitives:** Toast (kills 3× `alert()`), Avatar, StatCard, Field/FieldError, Dropzone, IconButton, Tabs; finish Modal (role=dialog, focus trap, Escape, scroll lock). *(ui-gap#3)*
19. **A11y + layout-shift sweep.** Clickable-div dropzone → real button; restore composer focus ring; `prefers-reduced-motion` guard on shimmer; aspect-ratio on single-image posts; responsive ImageRenderer; meaningful alt text. *(ui blockers)*
20. **Finish dark mode + theme toggle.** Body ground uses zinc literals that fight the token system; after 16-17, add a `data-theme` toggle. *(ui-gap#4)*

## P4 — Flow polish & cleanup

21. Feed tab state → URL search param (linkable, survives refresh/back). *(ux-gap#2)*
22. Dashboard: real counts via route loader instead of hardcoded zeros. *(ux#12)*
23. Onboarding: inline field errors (`aria-describedby`) driven by the shared Zod schema. *(ux#9)*
24. Collapse post publish-state to one canonical field (`post_status`); today `post_status`/`is_published`/`published_at` can disagree. *(system)*
25. Delete debris: six `app.config.timestamp_*.js`, `ReadMe.local.hostory.md`, orphaned `ImageUploader.tsx`, dead `getAuth0UserInfo`, `/Todo` scratch route; add `.gitignore` entry. *(code, system, ui)*
26. `.env.example`: fix `NEXT_PUBLIC_*` → `VITE_PUBLIC_*` and list every required secret; enforce a minimum `SESSION_SECRET` length. *(security-consider)*

---

## What the review confirmed is already good

Auth0 PKCE + state validation, BFF token isolation, cookie flags, 30-day absolute session cap, CSRF origin checks in the middleware chain, ownership checks via session userId, no SQL-injection/XSS sinks, no secrets in the client bundle, Workers-fit architecture (lazy Neon/Redis proxies, cookie-based PKCE state), and a textbook SSR feed initial-load (parallel loader + `initialData` seeding + skeleton parity). The skeleton of the app is sound — the work above is closing the gap between the documented architecture and the code.
