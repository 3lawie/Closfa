import { useEffect, useRef } from 'react'

interface UseInfiniteScrollOptions {
  /** Called when the sentinel element enters the viewport */
  onLoadMore: () => void
  /** Whether more data is available to load */
  hasMore: boolean
  /** Whether a fetch is currently in progress */
  isLoading: boolean
  /** How many px before the sentinel to trigger load (default: 200) */
  threshold?: number
}

/**
 * useInfiniteScroll — attaches to a sentinel div at the end of a list.
 * When the sentinel scrolls into view (with threshold buffer), calls onLoadMore.
 *
 * Usage:
 *   const { sentinelRef } = useInfiniteScroll({ onLoadMore, hasMore, isLoading })
 *   return (
 *     <>
 *       {posts.map(p => <PostCard key={p.id} post={p} />)}
 *       <div ref={sentinelRef} />
 *     </>
 *   )
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 200,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  // `useCallback(onLoadMore, [onLoadMore])` was a no-op — it returns a new
  // identity exactly when the input changes, so it stabilised nothing while
  // still re-creating the IntersectionObserver on every caller re-render.
  // A ref holds the latest callback without being an effect dependency.
  const onLoadMoreRef = useRef(onLoadMore)
  useEffect(() => { onLoadMoreRef.current = onLoadMore }, [onLoadMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMoreRef.current()
        }
      },
      {
        rootMargin: `${threshold}px`,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, threshold])

  return { sentinelRef }
}
