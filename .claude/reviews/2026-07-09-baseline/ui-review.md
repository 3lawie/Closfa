# Closfa UI Audit — ui-reviewer

Per `creative-ui/SKILL.md` + the ui-reviewer checklist. The overriding finding: **Closfa has two disconnected styling systems.** `index.css` defines a well-considered token set (brand/accent/surface/text, with a dark-mode block), and the newer components (Navbar, PostCard, FeedList, create, onboarding) consume them via inline `style={{ … var(--token) }}`. But the `src/components/ui/` primitives and the older surfaces (dashboard, ImageUploader, MediaContatiner, ImageRenderer, auth buttons, Todo, `__root` body) use **hardcoded Tailwind palette literals** (`bg-white`, `text-gray-700`, `bg-amber-500`, orphan `blue-*`) that ignore the tokens and have **no dark-mode response**. There is no `@theme` bridge, so the two systems can never converge.

## Findings (file:line — issue — fix)

**Primitives are dead code + not token/theme-aware**
- `src/components/ui/Button.tsx:10-15` — **Should fix.** Never imported anywhere (grep for `@/components/ui/` returns zero hits); every surface hand-rolls buttons instead. Also all variants use fixed `bg-amber-500 / bg-white / text-gray-700 / border-gray-200` → on the dark ground `secondary` renders a white button with grey text. Rebuild variants on tokens (`bg-[var(--surface)]`, `text-[var(--text)]`, `border-[var(--border)]`) or a `@theme` utility.
- `src/components/ui/Button.tsx:11,37` — **Should fix.** `primary` and the focus ring use **amber (brand)**, but the token doc (index.css:6-10) reserves amber for "logo, brand moments only" and makes **purple `--accent` the color of every interactive element / CTA / focus ring.** Primary CTA and focus ring should be `--accent`.
- `src/components/ui/Input.tsx:15,22-26` — **Should fix.** Unused; `bg-white text-gray-700 border-gray-200 focus:ring-amber-400`, no tokens, no dark. Same for `Textarea`.
- `src/components/ui/Card.tsx:17` — **Should fix.** Unused; `bg-white border-gray-100 shadow-sm` hardcoded, no dark variant.
- `src/components/ui/Spinner.tsx:21,31` — **Should fix.** `border-gray-200 border-t-amber-500` and `bg-gray-50` hardcoded; uses amber not accent.
- `src/components/loadingSpinner.tsx:5-9` — **Consider.** Duplicate of `Spinner`/`PageSpinner` using orphan `border-blue-500` (blue exists nowhere in the palette). Delete and standardize on `Spinner`.

**Modal a11y (the one primitive worth keeping — but incomplete)**
- `src/components/ui/Card.tsx:45-79` — **Blocker (a11y).** Modal has no `role="dialog"`/`aria-modal`, no focus trap, no Escape-to-close, no body-scroll lock, no focus restore. As-is it's not keyboard-operable. Add these before adopting it. Also `bg-white` hardcoded (no dark).

**Dashboard — most off-system route**
- `src/routes/_authenticated/dashboard.tsx:18-35` — **Should fix.** Entirely hardcoded: `bg-gray-50`, `bg-white border-gray-100`, `text-gray-600`, stat tiles `bg-blue-50/text-blue-700`, `bg-emerald-50`, `bg-purple-50`. Zero tokens → blinding/broken in dark mode, and blue/emerald are off-palette. No loading/empty state (all values hardcoded `0`). Rebuild on tokens + a `StatCard` primitive.

**Todo route — appears to be scratch, publicly reachable**
- `src/routes/Todo.tsx:16-59` — **Should fix.** "Weekly Dashboard" is unrelated to Closfa, uses arbitrary hex (`bg-[#F5F2ED]`, `bg-[#FCFAF7]`), `rounded-[2rem]`, off-palette orange/violet, `!p-2 !text-slate-800` important-overrides, and `grid-cols-7` that collapses to ~40px cells at 360px. Delete it or move out of `src/routes` so it isn't a live URL.

**ImageUploader — hand-rolled, no tokens, alert()**
- `src/components/media/ImageUploader.tsx:108` — **Should fix.** `bg-amber-500` button instead of the `Button` primitive.
- `:44` — **Should fix.** `alert('Please select a file')` for validation — there is no Toast primitive; use one (see gaps).
- `:101,129-133` — **Should fix.** File input + progress bar `text-gray-500 / bg-gray-200 / bg-amber-500` hardcoded, no dark. Raw file input has no visible/associated label.

**MediaContainer — cn() violations + a11y**
- `src/components/Dahsboard/MediaContatiner.tsx:172-175` — **Blocker (a11y).** The dropzone is a clickable `<div onClick>` — not keyboard-focusable or Enter/Space-operable. Make it a real `<button>` (or add `role="button"` + `tabIndex` + key handler).
- `:173,245-247,288,296` — **Should fix.** Template-string class concatenation with conditionals — direct checklist violation; use `cn()` (already imported project-wide).
- `:165-166,173,245-247` — **Should fix.** Hardcoded `text-gray-900/500`, `border-gray-300 bg-gray-50 hover:border-blue-400`, `bg-gray-100 border-gray-200 ring-blue-400` — no tokens, no dark, and `blue-400` contradicts the accent palette (should be `--accent`).
- `:138-159` — **Consider (a11y).** Drag-to-reorder has no keyboard alternative.
- `:79,83` — **Should fix.** `alert()` for file-size/type errors — no Toast.

**ImageRenderer — responsive + tokens**
- `src/components/media/ImageRenderer.tsx:157-164` — **Should fix.** Fixed `width=500 height=500` with the `<img>` carrying literal `width/height` attrs and no `max-w-full` → overflows a 360px viewport. Add `className="… max-w-full h-auto"` and cap width responsively.
- `:136-151` — **Should fix.** Loading/error states use `bg-gray-200 / text-gray-400 / bg-red-50 / text-red-400`, no tokens, no dark.

**PostCard — the good surface, two gaps**
- `src/components/feed/PostCard.tsx:127-130` — **Should fix (layout shift).** The single-image case (the most common) sets **no `aspectRatio`** (only `max-h-[420px]`), so the card reflows when the image loads. Multi-image already reserves `1/1`. Reserve a ratio for the single case too.
- `:132` — **Consider (a11y).** Feed images render `alt=""` (decorative) on user content; give a meaningful alt (author + caption excerpt).
- `:200,219,223` — **Consider.** `ml-[52px]` arbitrary value repeated 3× (avatar 40px + gap 12px). Extract to a token/const so it can't drift.

**FeedList — missing error state**
- `src/components/feed/FeedList.tsx:137` — **Should fix.** Renders `isLoading ? skeleton : content`; there is no `isError` branch, so a failed feed fetch shows an empty column. Add an error state with retry (checklist item 5).

**Auth buttons — duplicate + off-token**
- `src/components/auth/index.tsx:22-23,48-49` — **Should fix.** `LoginButton` (`text-black bg-gray-100 border-amber-500 shadow-amber-200`) and `LogoutButton` (`bg-red-50 text-red-600`) are hardcoded, no dark, and **duplicate** the token-based login/logout controls already inline in `Navbar.tsx:37-70` — two different login button designs coexist. Consolidate onto one token-based primitive.

**Onboarding — primitives bypassed, focus color off**
- `src/routes/onboarding.tsx:101-110` — **Should fix.** Hand-rolled input instead of `Input`; `focus:ring-blue-500` (orphan blue, should be `--accent`).
- `:119-124` — **Should fix.** Submit CTA uses `var(--brand)` amber — brand-as-CTA again contradicts the accent role. Use `Button` primitive / `--accent`.
- `:114-116` — **Consider (a11y).** Error is a bare red `<div>` not linked to the field via `aria-describedby`.

**Create composer — suppressed focus**
- `src/routes/_authenticated/create.tsx:53` — **Blocker (a11y).** Composer textarea uses `focus:ring-0` with no replacement — focus indicator removed on the page's primary input (SKILL: "never bare `outline-none`/suppressed focus"). Restore a visible focus ring.
- `:33-39` — **Consider.** Publish button correctly uses `var(--accent)` (right role!) but is still hand-rolled — should be the `Button` primitive once that's token-based.

**Global CSS**
- `src/index.css:150-160` — **Should fix (a11y).** `.skeleton` shimmer and the several `animate-pulse` usages loop infinitely with no `@media (prefers-reduced-motion: reduce)` guard — SKILL: "Nothing loops forever in a calm app; respect prefers-reduced-motion."
- `src/index.css:108-126` — **Consider.** `h1/h2` set size/weight/line-height but no `text-wrap: balance` (SKILL asks for it on headings).
- `src/routes/__root.tsx:23` — **Should fix.** Body uses `bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50` — a **third** color system (Tailwind zinc dark-variant) that conflicts with `:root { background: var(--bg) }`. Body ground should be `var(--bg)` / `var(--text)`, not zinc literals.

## UI modernization gaps (highest-impact investments)

1. **Bridge tokens into Tailwind with `@theme` (root cause).** Add a `@theme` block in `index.css` mapping the CSS vars to utilities (`bg-surface`, `bg-page`, `text-heading`, `text-body`, `border-default`, `bg-accent`, `ring-accent`). This is the single change that lets primitives and every surface stop hardcoding `gray/white/amber` and become theme-aware — it collapses the two-system split. Everything below depends on it.

2. **Make the `ui/` primitives the real, token-based source of truth and adopt them.** Button/Card/Input/Spinner are currently dead code built on the wrong palette. Rebuild them on tokens (accent = primary/focus, brand = logo only), then migrate the hand-rolled buttons/inputs in onboarding, create, ImageUploader, dashboard, and auth onto them. Removes duplication (two login buttons, two spinners) and fixes the brand-vs-accent role inversion in one pass.

3. **Add the missing primitives.** In priority order: **Toast** (replaces 3× `alert()`), **Avatar** (duplicated in PostCard, Navbar, create), **StatCard** (dashboard), **Field/FieldError** (onboarding a11y), **Dropzone** and **IconButton** (MediaContainer), **Tabs** (FeedList). And finish **Modal** (focus trap, Escape, `role="dialog"`, scroll lock).

4. **Complete dark mode.** Tokens already flip via `prefers-color-scheme`, but ~half the components use fixed light palettes and break in dark. After gaps 1-2 most of this resolves; then add a **user-facing theme toggle** with `data-theme` on `:root` (the app currently follows OS only, and `color-scheme: light dark` is already declared).

5. **A11y + layout-shift baseline sweep.** Fix the Blockers (clickable-div dropzone, `focus:ring-0` composer, Modal focus management), add a `prefers-reduced-motion` guard for the shimmer/pulse loops, reserve aspect-ratio for the single-image feed case, and make ImageRenderer responsive (`max-w-full`) so it holds at 360px.

Net: the newer feed/nav layer is genuinely on-system and theme-aware — the work is pulling the primitives and the older routes (dashboard, uploader, media container, onboarding, auth, Todo) up to that same token-based bar, with `@theme` as the enabling first step.
