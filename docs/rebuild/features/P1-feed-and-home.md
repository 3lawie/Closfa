# P1 — Feed & Home

### Route & Loading
**Route:** `/` (`src/routes/index.tsx`).
**Mechanism:** The route `loader` executes server-side, invoking `getFeedFn({ data:{ limit:15 } }).catch(()=>null)`. This prefetched page 1 is passed to `FeedList` and set as `initialData` for `useInfiniteQuery`. This SSR-seed pattern eliminates the initial loading flash and is the canonical read pattern for all data-heavy pages. Authentication is handled via `[F2]` optionalAuthMiddleware, allowing public access while supporting logged-in state.

***

### 1) For-You Feed
> Feature — Discoverability algorithm ranking posts by likes then recency.
> Rules — Must use OFFSET (page number) pagination, not keyset, because ranking scores (likes) mutate asynchronously during scroll; keyset cursors would break if a post moves ranks position.
> Pattern — Offset Pagination `[F1]`, Server Function `[F3]` returning `FeedPage`.
> Data — `post` (likes, published_at); ranked by `postFeedRankIndex`.
> Connections — Seeds `FeedList`, flows into `PostCard`.
> Hint — 
    ```tsx
    const query = useInfiniteQuery({
      queryKey: ['feed', 'forYou'],
      queryFn: ({ pageParam }) => getFeedFn({ data: { page: pageParam, limit: 15 } }),
      initialPageParam: 1,                       // getFeedFn pages are 1-based
      initialData: firstPage ? { pages: [firstPage], pageParams: [1] } : undefined,
      getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    });
    ```
> Answer key — `ai:src/routes/index.tsx`, `ai:src/server/actions/Database/services/feed.service.ts`
> Watch-out — Do not "fix" the offset pagination to keyset; the mutable ranking requirement is intentional.

### 2) Following Feed
> Feature — Auth-only chronological feed of followees.
> Rules — Requires active session. Must use KEYSET cursor for stability; `${published_at}_${postId}` ensures no duplicates/deletions if new posts arrive mid-scroll.
> Pattern — Keyset Pagination `[F1]`, Auth-only tab.
> Data — `follow` (followerId, followedId), `post` (published_at, postId).
> Connections — Toggles within `FeedList`, distinct query `getFollowingFeedFn`.
> Hint —
    ```tsx
    getNextPageParam: (lastPage) => {
      if (!lastPage.nextCursor) return undefined;
      // Cursor string format: "timestamp_postId"
      return { cursor: lastPage.nextCursor }; 
    }
    ```
> Answer key — `ai:src/components/feed/FeedList.tsx`, `ai:src/server/actions/Database/services/feed.service.ts`
> Watch-out — `FeedList` casts the following-cursor pageParam with `as any` due to Drizzle-beta typing quirks; isolate this cast strictly to the query call.

### 3) Infinite Scroll
> Feature — Seamlessly append pages as user scrolls.
> Rules — Must trigger only when the sentinel element enters the viewport. Stale time must be ~30s to prevent aggressive refetching.
> Pattern — React Infinite Query, Intersection Observer API.
> Data — Cache (client-side).
> Connections — `FeedList` root controller appends to `flattenedPages`.
> Hint —
    ```tsx
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) fetchNextPage();
    }, { rootMargin: '200px' });
    ```
> Answer key — `ai:src/components/feed/FeedList.tsx`

### 4) Loading State
> Feature — Visual feedback while fetching subsequent pages.
> Rules — Skeletons must exactly match `PostCard` dimensions (`PostCardSkeleton`) to prevent Cumulative Layout Shift (CLS). Do not show spinner if `initialData` exists.
> Pattern — Skeleton Loading `[P2]`.
> Data — N/A (UI state).
> Connections — Rendered at bottom of `FeedList`.
> Hint —
    ```tsx
    {isFetchingNextPage && (
      <div className="space-y-4">
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    )}
    ```
> Answer key — `ai:src/components/feed/PostCardSkeleton.tsx`
> Watch-out — Ensure skeleton heights include media aspect ratios or fixed heights to lock the layout.

### 5) Error + Retry
> Feature — Graceful failure handling for network issues.
> Rules — Errors on the PRIMARY surface (the feed list itself) must be explicit. Never show eternal skeleton or silent disappearance on failure. Provide a retry action.
> Pattern — Error Boundary / Query Error status.
> Data — N/A (Error state).
> Connections — `FeedList` renders error banner.
> Hint —
    ```tsx
    {isError && (
      <div className="p-4 bg-red-50 text-red-600 flex justify-between">
        <span>Failed to load feed.</span>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    )}
    ```
> Answer key — `ai:src/components/feed/FeedList.tsx`

### 6) Empty + End States
> Feature — User guidance for feed boundaries.
> Rules — Distinguish "no posts at all" (Empty) from "fetched everything available" (End).
> Pattern — Exhaustive State Matching.
> Data — N/A.
> Connections — `FeedList` render logic.
> Hint —
    ```tsx
    {!data || data.pages[0].items.length === 0 ? <EmptyState /> :
     !hasNextPage && <EndState message="You're all caught up" />}
    ```
> Answer key — `ai:src/components/feed/FeedList.tsx`

### 7) Scroll-Break Nudge
> Feature — Intentional pause to discourage doom-scrolling.
> Rules — Insert `ScrollBreakNudge` after index 15 (`SCROLL_BREAK_AFTER`). It must be a soft, dismissible card, not a hard blocking modal.
> Pattern — Aware-Intention UX `[F5]`.
> Data — N/A.
> Connections — Injected into `FeedList` map loop.
> Hint —
    ```tsx
    {showNudge && (
      <li className="col-span-full my-4">
        <ScrollBreakNudge onDismiss={() => setShowNudge(false)} />
      </li>
    )}
    ```
> Answer key — `ai:src/components/feed/FeedList.tsx`

### 8) Keyboard-First Navigation
> Feature — Full feed control via keyboard without mouse.
> Rules — Track `focusedIndex`. `Up`/`Down` move focus. `Shift`+`Up`/`Down` page through. Actions: `L`/`K` (like), `C` (comment), `S` (share), `Shift+S` (save), `Space` (play/pause), `Left`/`Right` (seek). Guard typing targets (inputs). Hint on `Shift+/`.
> Pattern — Keyboard Navigation `[P1]`, Event Delegation.
> Data — N/A (Interaction state).
> Connections — `FeedList` listener handles focus; focused `PostCard` handles actions.
> Hint —
    ```tsx
    useEffect(() => {
      const handle = (e: KeyboardEvent) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'ArrowDown') setFocused(i => i + 1);
        if (e.code === 'KeyL') triggerLike(focusedIndex);
      };
      window.addEventListener('keydown', handle);
    }, [focusedIndex]);
    ```
> Answer key — `ai:src/components/feed/FeedList.tsx`, `ai:src/components/feed/PostCard.tsx`

***

### Cross-Links
See `[P2]` (PostCard details) and `[P7]` (Loader patterns) for component-level logic. Feed wrappers use `[F3]`/`[F1]`.

### Watch-Outs
*   **Cursor Casting:** The `FeedList` implementation casts the `following` cursor `pageParam` as `any`. Do not clean this up or spread it into the type definition; isolate the cast purely to satisfy Drizzle-beta strictness on complex generic types.
*   **Pagination Asymmetry:** The "For-You" feed uses OFFSET while "Following" uses KEYSET. Do not attempt to unify these into a single cursor strategy. The mutable ranking of "For-You" strictly requires OFFSET, whereas the chronological integrity of "Following" strictly requires KEYSET.