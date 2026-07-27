# P7 — Design System & Theming

The UI foundation the other pages render through: the token bridge, the primitives, and — most importantly for the rebuild — the **prescribed optimistic-UI pattern**. This is the page where the map most often says "the AI did it a lesser way; here's the better one."

## 1. The token bridge (`@theme`)

**Rule — colors are OKLCH CSS variables, exposed to Tailwind through one `@theme` block, so utilities like `bg-surface` / `text-text-s` / `ring-accent-border` are real.** This was the root fix for the pre-AI UI drift (half the app had hardcoded `gray/white/amber`).

Two layers, on purpose:
- **Bare runtime vars** in `:root` (`--bg`, `--surface`, `--text`, `--accent`, `--brand`, `--danger`, `--mention`, radii `--r-*`, motion `--motion-*`) — these are what you *swap* to re-skin.
- **`@theme` re-exposes them** under Tailwind's required prefixes via `var()` indirection, avoiding a naming collision:

```css
@theme {
  --color-surface: var(--surface);
  --color-text-s:  var(--text-s);
  --color-accent-border: var(--accent-border);
  --radius-pill: var(--r-pill);
}
:root { --surface: oklch(1 0 0); --accent: oklch(0.72 0.110 155); /* mint */ }
.dark { --surface: oklch(0.21 0.016 275); /* same names, dark values */ }
```

**Two independent axes** are documented in the file: `light/dark` (governs neutrals) and `data-theme` (a "personality" axis: rest/awareness/warmth/anger/relief).

> **Watch-out — `data-theme` is aspirational.** Only the **"relief"** theme is actually baked into `:root`/`.dark`; nothing ever sets a `data-theme` attribute and there is no switcher. Treat it as scaffolding, not wired behavior. If you want the multi-theme system, that's a real (unbuilt) feature to design.

**Rules that save you pain:**
- **Dark mode = a `.dark` class on `<html>`**, set two ways: an inline anti-FOUC `<script>` in root `<head>` reads `localStorage.theme`/`prefers-color-scheme` *before paint*; `ThemeToggle` flips the class and writes `localStorage`.
- **Scrims are intentionally hardcoded `bg-black/40`, not a token** — a backdrop must stay dark in light mode too. Same reasoning for onboarding's fixed `text-white` on a gradient.
- `--brand` (bright yellow) and `--accent` (mint) fail WCAG as small text on white — a contrast audit is noted right in the CSS. Don't use them for body text; they're for fills/CTAs/icons.

> **Answer key:** `ai:src/index.css`, `ai:src/components/ui/ThemeToggle.tsx`, `ai:src/routes/__root.tsx` (the anti-FOUC script).

## 2. Primitives (`src/components/ui/`)

All primitives are token-classed and share the motion vars `duration-[var(--motion-fast)] ease-[var(--motion-ease)]`. `cn()` = `twMerge(clsx(...))` merges class strings so a caller's `className` wins.

**Button** is the reference — a `variant` map × `size` map, with `isPending` rendering an inline spinner and disabling:

```tsx
const variants = {
  primary:     'bg-accent text-white hover:bg-accent-hover shadow-sm',
  secondary:   'bg-surface border border-border text-text hover:bg-surface-translucent',
  ghost:       'bg-transparent text-text-s hover:text-text hover:bg-surface-translucent',
  destructive: 'bg-danger text-white hover:bg-danger-hover',
}
// <button className={cn('inline-flex … active:scale-95 disabled:opacity-50',
//                       variants[variant], sizes[size], className)}
//         disabled={disabled || isPending}>{isPending ? <Loader2 …/> : children}</button>
```

The set to rebuild, and the rule each teaches:

| Primitive | Rule it encodes |
|---|---|
| `Button` | variant = role (accent is the interactive color, danger is fixed); `isPending` owns the spinner |
| `Card` | one surface recipe: `bg-surface border border-border rounded-lg shadow-sm` |
| `Input`/`Textarea` | label+error wrapper, `focus:ring-2 focus:ring-accent-border`, id derived from label |
| `Modal` | `createPortal` + a `mounted` flag (no SSR hydration mismatch) + body-scroll lock + Escape + focus |
| `ConfirmDialog` | the app-styled replacement for `window.confirm` (an `alertdialog`) |
| `Toast` | a **module-level store, not Context** — so `toast(msg)` is callable from any mutation's `onError` |
| `VerifiedBadge` / `Spinner` / `ThemeToggle` | small, token-classed, reused everywhere |

**Rule — Toast is a store, not a provider.** Because it's a module-level `toasts`/`listeners` pair with a single `<Toaster/>` mounted in root, any server-mutation callback can call `toast(...)` without being inside a React context. That's what makes the delete-with-undo flow ([P2]) possible.

> **Answer key:** `ai:src/components/ui/{Button,Card,Input,Modal,ConfirmDialog,Toast,VerifiedBadge,Spinner,ThemeToggle}.tsx`.
> **Watch-out:** most routes hand-roll the Card class string inline instead of using `<Card>`. Prefer the primitive so a token change propagates.

## 3. Optimistic UI — the prescribed pattern ⭐

This is the most important rebuild upgrade. There are **two** optimistic situations; use the right tool for each.

### (a) A single local value (like / save / a boolean toggle) → React 19 `useOptimistic`

**Prescribed base pattern.** `useOptimistic` shows the flipped value during the in-flight transition and **auto-reverts if the action throws**; pair it with a `useMutation` that writes the real cache on success so the change persists after the transition ends.

```tsx
const [view, setOptimistic] = useOptimistic(
  { liked, likes },
  (s, next: boolean) => ({ liked: next, likes: s.likes + (next ? 1 : -1) })
)
const onLike = () => startTransition(async () => {
  setOptimistic(!view.liked)                       // instant, local
  const res = await toggleLike({ data: { postId } })
  if (res.ok) queryClient.setQueryData(['post', postId], /* reconcile with res.data */)
})  // if toggleLike throws, React discards the optimistic value automatically
```

> **The AI branch does this the pre-React-19 way** — manual `useState` for `liked`/`localLikes` plus a hand-written snapshot restored in `onMutate`/`onError` (`ai:src/components/feed/PostCard.tsx`, mirrored in `CommentItem.tsx`). It *works*, but it duplicates rollback logic in every component and predates `useOptimistic`. **Prescription:** rebuild these with `useOptimistic` + `useReducer`; treat the AI version as "acceptable but supersede." Apply to: `PostCard` like/save/share, `CommentItem` + reply likes.

### (b) A cached list/collection (settings toggles, muted-keyword chips) → TanStack Query optimistic

For data that lives in the query cache, don't lift it into local state — mutate the cache and roll back:

```ts
onMutate: async (vars) => {
  await queryClient.cancelQueries({ queryKey: KEY })
  const previous = queryClient.getQueryData(KEY)
  queryClient.setQueryData(KEY, (old) => applyChange(old, vars))
  return { previous }
},
onError: (_e, _v, ctx) => queryClient.setQueryData(KEY, ctx.previous),   // exact rollback
onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),        // reconcile with server
```

> This is the correct shape for [P6] settings (notification prefs, muted keywords). The AI branch already uses it there — keep it. **Rule of thumb:** local single value → `useOptimistic`; cached collection → Query `onMutate`. Don't reach for `router.invalidate()` as your optimism (that's a refetch, not optimism) — [P4] follow is the one place the AI accepts that tradeoff, and it says why (a stale follower *count*).

## 4. Loader + `initialData` SSR seed (reference)

The canonical read pattern — a route `loader` fetches page 1 server-side and the client query is seeded so there's no loading flash. Stated in full in [P1]; every read page ([P2], [P3], [P4], [P5]) reuses it. The fail-soft twist for gated panels: a `null` from the loader means "unauthorized — never mount," via `initialData: x !== null ? … : undefined` + `enabled: x !== null`.

## 5. Layout & motion

- **`AccountRail`** — the fixed bottom-left cluster (pulsing notification heart with an unread badge polled ~60s, search, a more-menu, avatar→own profile). **`Logo`** always routes home.
- **Page transitions** — `AnimatePresence` keyed on `routeId` in `__root.tsx` (framer-motion).
- **A11y rules to keep:** `prefers-reduced-motion` guards on the shimmer/wave animations; real `<button>`s (not clickable divs) for the dropzone; visible focus rings; meaningful `alt`. These were explicit [P3-plan] blockers — don't regress them.

> **Answer key:** `ai:src/components/layout/{AccountRail,Logo}.tsx`, `ai:src/routes/__root.tsx`.

---

**This closes the foundations-and-pages loop.** From here, pick any feature in [P1]–[P6], read its rules, and build it by hand — reaching back to [F1]–[F5] and this page for the shared patterns. Check yourself against the `ai:` answer key only after you've tried.
