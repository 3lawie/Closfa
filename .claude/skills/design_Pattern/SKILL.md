---
name: frontend-patterns
description: Frontend development patterns for React, Next.js, state management, performance optimization, and UI best practices. Surfaces open system-design choices to the user instead of silently picking one; taken from an external source, adapted for this project.
metadata:
  origin: ECC
---

## When to Activate

- Building React components (composition, props, rendering)
- Managing state (useState, useReducer, Zustand, Context)
- Implementing data fetching (SWR, React Query, server components)
- Optimizing performance (memoization, virtualization, code splitting)
- Working with forms (validation, controlled inputs, Zod schemas)
- Handling client-side routing and navigation
- Building accessible, responsive UI patterns

## Ask before deciding — this project hasn't fixed these yet

`package.json` has no Zustand, Framer Motion, react-virtual, or form library — so these are still open. Before implementing one, ask the user which to use (`AskUserQuestion`); once they answer, that becomes the project's convention going forward, so later work should match it instead of asking again.

- **Component reuse shape** — plain composition vs. compound components (shared context) vs. render props, when building a multi-part reusable component.
- **Shared state** — local `useState`/`useReducer`, Context+reducer, or an external store (e.g. Zustand), when state needs to cross more than 2-3 components.
- **Animation** — Framer Motion vs. plain CSS transitions, when a component needs enter/exit or gesture motion.
- **List virtualization** — plain render vs. `@tanstack/react-virtual`, when a list can grow past ~100 items.

## Already decided — don't re-ask, follow the exemplar

- **Data fetching & mutations** — `@tanstack/react-query` is installed and in use (`FeedList.tsx`, `PostCard.tsx`). Discover the closest existing query/mutation for the pattern; see `/patterns`.
- **Form validation** — Zod schemas from `src/verification/`, shared client/server; see root `CLAUDE.md`.

## Non-obvious gotchas

- **useQuery stable refs** — keep `fetcher`/`options` in refs so `refetch` stays referentially stable; otherwise inline definitions cause the effect to rerun each render → infinite loop.
```typescript
const fetcherRef = useRef(fetcher);
const optionsRef = useRef(options);
useEffect(() => {
  fetcherRef.current = fetcher;
  optionsRef.current = options;
}, []);
```

- **Array sort mutation** — copy the array before sorting; `Array.prototype.sort` mutates the original, breaking memoization and causing unexpected UI updates.
```typescript
const sortedMarkets = useMemo(() => [...markets].sort((a, b) => b.volume - a.volume), [markets]);
```

- **Modal focus management** — save the element that had focus before opening the modal and restore it on close to maintain keyboard navigation flow.
```typescript
useEffect(() => {
  if (isOpen) {
    previousFocusRef.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
  } else {
    previousFocusRef.current?.focus();
  }
}, [isOpen]);
```
