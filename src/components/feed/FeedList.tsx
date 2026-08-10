import { Fragment, useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils/cn'
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll'
import { PostCard } from './PostCard'
import { FeedSkeleton, PostCardSkeleton } from './PostCardSkeleton'
import { KeyboardShortcutsHint } from './KeyboardShortcutsHint'
import {
  getFeedFn,
  getFollowingFeedFn,
} from '@/server/actions/Database/services/feed.service'
import type { FeedPage } from '@/lib/entities/Post'

/**
 * The following-feed's compound cursor. useInfiniteQuery types `pageParam` as
 * `unknown` unless the whole query is generically annotated, so this names the
 * shape once instead of casting each field through `any` at the call site.
 */
interface FeedCursor {
  cursor?: string
  direction?: 'older' | 'newer'
}
import type { PublicSessionData } from '@/server/lib/session'
import { motion, AnimatePresence } from 'framer-motion'
import { Feather, X } from 'lucide-react'

type Tab = 'forYou' | 'following'

// How many posts deep before the gentle scroll-break nudge appears — once,
// per tab, per session. Not a hard block or a timer, just a soft "you can
// stop here" signal — matches this app's aware-intention premise instead of
// working against it.
const SCROLL_BREAK_AFTER = 15

function ScrollBreakNudge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-4 p-5 my-2 rounded-lg border border-border bg-surface"
    >
      <div className="w-9 h-9 shrink-0 rounded-full bg-accent-bg text-accent flex items-center justify-center">
        <Feather className="w-4 h-4" />
      </div>
      <p className="flex-1 text-sm text-text-s">
        You've been here a little while — no pressure, just a nudge that it's a fine place to stop.
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-text-s hover:text-text shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

type FeedListProps = {
  session: PublicSessionData | null
  initialFeedPage: FeedPage | null
}

export function FeedList({ session, initialFeedPage }: FeedListProps) {
  const [activeTab, setActiveTab] = useState<Tab>('forYou')

  // ── "For You" infinite query ────────────────────────────────
  const forYouQuery = useInfiniteQuery({
    queryKey: ['feed', 'forYou'],
    queryFn: ({ pageParam }) =>
      getFeedFn({ data: { page: pageParam as number, limit: 15 } }),
    initialPageParam: 1,
    initialData: initialFeedPage
      ? { pages: [initialFeedPage], pageParams: [1] }
      : undefined,
    staleTime: 30_000, // re-fetch after 30s in background
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  })

  // ── "Following" infinite query ──────────────────────────────
  const followingQuery = useInfiniteQuery({
    queryKey: ['feed', 'following', session?.userId],
    queryFn: ({ pageParam }) =>
      getFollowingFeedFn({
        data: {
          cursor: (pageParam as FeedCursor | undefined)?.cursor,
          direction: (pageParam as FeedCursor | undefined)?.direction,
          limit: 15
        }
      }),
    initialPageParam: { cursor: undefined as string | undefined, direction: 'older' as 'older' | 'newer' },
    enabled: !!session && activeTab === 'following',
    staleTime: 30_000,
    getNextPageParam: (lastPage) => lastPage.nextCursor ? { cursor: lastPage.nextCursor, direction: 'older' as 'older' | 'newer' } : undefined,
    getPreviousPageParam: (firstPage) => firstPage.previousCursor ? { cursor: firstPage.previousCursor, direction: 'newer' as 'older' | 'newer' } : undefined,
  })

  const activeQuery = activeTab === 'forYou' ? forYouQuery : followingQuery
  const posts = activeQuery.data?.pages.flatMap((p) => p.posts) ?? []

  // ── Infinite scroll sentinel ────────────────────────────────
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: () => activeQuery.fetchNextPage(),
    hasMore: !!activeQuery.hasNextPage,
    isLoading: activeQuery.isFetchingNextPage,
  })

  // ── Keyboard navigation ──────────────────────────────────────
  // Up/Down move focus one post at a time; Shift+Up/Down page the viewport
  // (like PageUp/PageDown). The focused post is what per-post shortcuts
  // (L/K like, C comment, S share, Shift+S save, arrows for its image
  // slider — see PostCard) act on.
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [scrollBreakDismissed, setScrollBreakDismissed] = useState(false)

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      // Ctrl/Cmd/Alt+Arrow are OS/browser text-navigation shortcuts on most
      // platforms — never treat them as feed navigation.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key.toLowerCase()

      if (key === 'arrowdown' && e.shiftKey) {
        e.preventDefault()
        window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' })
      } else if (key === 'arrowup' && e.shiftKey) {
        e.preventDefault()
        window.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' })
      } else if (key === 'arrowdown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, Math.max(posts.length - 1, 0)))
      } else if (key === 'arrowup') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [posts.length])

  return (
    <div className="w-full">
      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="sticky top-16 lg:top-0 z-30 bg-surface-translucent backdrop-blur-md mb-6 border-b border-border flex">
        {(['forYou', 'following'] as Tab[]).map((tab) => {
          const isActive = activeTab === tab
          const label = tab === 'forYou' ? 'For You' : 'Following'
          const disabled = tab === 'following' && !session

          return (
            <button
              key={tab}
              onClick={() => { if (!disabled) { setActiveTab(tab); setFocusedIndex(0) } }}
              disabled={disabled}
              className={cn(
                "relative flex-1 py-4 text-sm font-bold transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                isActive ? "text-text" : "text-text-s hover:text-text",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              title={disabled ? 'Log in to see posts from people you follow' : undefined}
            >
              {label}
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-brand rounded-t-full"
                />
              )}
              {tab === 'following' && session && (followingQuery.data?.pages[0]?.posts.length ?? 0) > 0 && (
                <span className="absolute top-4 right-8 w-2 h-2 rounded-full bg-brand" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Post list ──────────────────────────────────────── */}
      <div className="relative min-h-[50vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: activeTab === 'forYou' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: activeTab === 'forYou' ? 20 : -20 }}
            transition={{ duration: 0.2 }}
          >
            {activeQuery.isLoading ? (
              <FeedSkeleton/>
            ) : (
              <div className="flex flex-col">
                {activeTab === 'following' && followingQuery.hasPreviousPage && (
                  <button
                    onClick={() => followingQuery.fetchPreviousPage()}
                    disabled={followingQuery.isFetchingPreviousPage}
                    className="py-3 px-6 rounded-full bg-accent-bg text-accent font-semibold text-sm self-center hover:bg-accent-hover transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] mb-6"
                  >
                    {followingQuery.isFetchingPreviousPage ? 'Loading...' : 'Load New Posts ↑'}
                  </button>
                )}

                {posts.map((post, index) => (
                  <Fragment key={post.postId}>
                    <PostCard post={post} currentUserId={session?.userId} isFocused={index === focusedIndex}/>
                    {index === SCROLL_BREAK_AFTER - 1 && (
                      <AnimatePresence>
                        {!scrollBreakDismissed && <ScrollBreakNudge onDismiss={() => setScrollBreakDismissed(true)} />}
                      </AnimatePresence>
                    )}
                  </Fragment>
                ))}

                {/* "Load more" skeleton card */}
                {activeQuery.isFetchingNextPage && <div className="mt-4"><PostCardSkeleton/></div>}

                {/* Sentinel div — triggers next page when visible */}
                <div ref={sentinelRef} className="h-4 w-full" />

                {/* Primary‑surface error (no posts) */}
                {activeQuery.isError && posts.length === 0 && !activeQuery.isLoading && (
                  <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                    <p className="text-text font-bold text-lg mb-4">
                      Couldn't load the feed.
                    </p>
                    <button
                      onClick={() => activeQuery.refetch()}
                      className="py-3 px-6 rounded-full bg-brand text-text-h font-semibold transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] shadow-sm hover:shadow-md"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Failed next‑page error */}
                {activeQuery.isFetchNextPageError && (
                  <div className="flex justify-center my-8">
                    <button
                      onClick={() => activeQuery.fetchNextPage()}
                      className="py-3 px-6 rounded-full bg-danger-hover text-danger font-semibold text-sm hover:opacity-90 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                    >
                      Couldn't load more — Retry
                    </button>
                  </div>
                )}

                {/* End-of-feed message */}
                {!activeQuery.hasNextPage && posts.length > 0 && (
                  <p className="text-center py-12 text-text-s text-sm font-medium tracking-wide">
                    You're all caught up ✦
                  </p>
                )}

                {/* Empty state — Following tab, no follows yet */}
                {activeTab === 'following' && session && posts.length === 0 && !activeQuery.isLoading && !activeQuery.isError && (
                  <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
                    <div className="w-16 h-16 rounded-lg bg-accent-bg text-accent flex items-center justify-center text-2xl mb-6">
                      ✦
                    </div>
                    <p className="text-xl font-bold text-text mb-2">
                      Nothing here yet
                    </p>
                    <p className="text-text-s max-w-sm">
                      Follow some people to see their posts here.
                    </p>
                  </div>
                )}

                {/* Empty state — For You, no posts at all */}
                {activeTab === 'forYou' && posts.length === 0 && !activeQuery.isLoading && !activeQuery.isError && (
                  <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
                    <p className="text-xl font-bold text-text mb-2">
                      No posts yet
                    </p>
                    <p className="text-text-s max-w-sm">
                      Be the first to post something.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Unconditional — gating this on posts.length meant the help panel
          (and its Shift+/ listener) vanished entirely whenever the feed was
          loading, empty, or errored, so it looked "broken" in exactly the
          situations someone would most want to check what's available. */}
      <KeyboardShortcutsHint />
    </div>
  )
}
