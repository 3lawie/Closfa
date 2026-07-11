import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils/cn'
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll'
import { PostCard } from './PostCard'
import { FeedSkeleton, PostCardSkeleton } from './PostCardSkeleton'
import {
  getFeedFn,
  getFollowingFeedFn,
} from '@/server/actions/Database/services/feed.service'
import { feedPage } from '@/lib/entities/Post'
import { SessionData } from '@/server/lib/session'
import z from 'zod'

type Tab = 'forYou' | 'following'

const feedListProps = z.object({
  session: SessionData,
  initialFeedPage: feedPage
}).nonoptional()

type FeedListProps = z.infer<typeof feedListProps>

export function FeedList({ session, initialFeedPage }: FeedListProps) {
  const [activeTab, setActiveTab] = useState<Tab>('forYou')

  // ── "For You" infinite query ────────────────────────────────
  const forYouQuery = useInfiniteQuery({
    queryKey: ['feed', 'forYou'],
    queryFn: ({ pageParam }) =>
      getFeedFn({ data: { page: pageParam as number, limit: 15 } }),
    initialPageParam: 1,
    // Seed with the SSR loader data — no loading flash on first render
    initialData: initialFeedPage
      ? { pages: [initialFeedPage], pageParams: [1] }
      : undefined,
    staleTime: 30_000, // re-fetch after 30s in background
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  })

  // ── "Following" infinite query ──────────────────────────────
  // Only starts fetching when the tab is selected AND user is logged in.
  const followingQuery = useInfiniteQuery({
    queryKey: ['feed', 'following', session?.userId],
    queryFn: ({ pageParam }) =>
      getFollowingFeedFn({
        data: {
          cursor: (pageParam as any)?.cursor as string | undefined,
          direction: (pageParam as any)?.direction as 'older' | 'newer' | undefined,
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

  return (
    <div className="flex flex-col" style={{ background: 'var(--surface)' }}>
      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div
        className="sticky top-14 z-40 flex border-b"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {(['forYou', 'following'] as Tab[]).map((tab) => {
          const isActive = activeTab === tab
          const label = tab === 'forYou' ? 'For You' : 'Following'
          const disabled = tab === 'following' && !session

          return (
            <button
              key={tab}
              onClick={() => !disabled && setActiveTab(tab)}
              disabled={disabled}
              className={cn(
                'flex-1 py-3 text-sm font-semibold transition-colors relative',
                disabled && 'opacity-40 cursor-not-allowed',
              )}
              style={{
                color: isActive ? 'var(--accent)' : 'var(--text)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              title={disabled ? 'Log in to see posts from people you follow' : undefined}
            >
              {label}
              {/* Unread indicator dot — to be wired up in notifications phase */}
              {tab === 'following' && session && followingQuery.data?.pages[0]?.posts.length === 0 && (
                <span
                  className="ml-1.5 w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Post list ──────────────────────────────────────── */}
      {activeQuery.isLoading ? (
        <FeedSkeleton />
      ) : (
        <>
          {activeTab === 'following' && followingQuery.hasPreviousPage && (
            <button
              onClick={() => followingQuery.fetchPreviousPage()}
              disabled={followingQuery.isFetchingPreviousPage}
              className="w-full py-3 text-sm font-semibold transition-colors flex justify-center items-center"
              style={{ color: 'var(--accent)', background: 'var(--accent-bg)' }}
            >
              {followingQuery.isFetchingPreviousPage ? 'Loading...' : 'Load New Posts ↑'}
            </button>
          )}

          {posts.map((post) => (
            <PostCard key={post.postId} post={post} />
          ))}

          {/* "Load more" skeleton card */}
          {activeQuery.isFetchingNextPage && <PostCardSkeleton />}

          {/* Sentinel div — triggers next page when visible */}
          <div ref={sentinelRef} className="h-px" />

          {/* Primary‑surface error (no posts) */}
          {activeQuery.isError && posts.length === 0 && !activeQuery.isLoading && (
            <div className="py-16 flex flex-col items-center gap-3 px-8 text-center">
              <p className="font-semibold" style={{ color: 'var(--text-h)' }}>
                Couldn't load the feed.
              </p>
              <button
                onClick={() => activeQuery.refetch()}
                className="py-2 px-4 rounded"
                style={{ color: 'var(--accent)', background: 'var(--accent-bg)' }}
              >
                Try again
              </button>
            </div>
          )}

          {/* Failed next‑page error */}
          {activeQuery.isFetchNextPageError && (
            <div className="py-4 flex justify-center">
              <button
                onClick={() => activeQuery.fetchNextPage()}
                className="text-sm py-2 px-4 rounded"
                style={{ color: 'var(--accent)', background: 'var(--accent-bg)' }}
              >
                Couldn't load more — Retry
              </button>
            </div>
          )}

          {/* End-of-feed message */}
          {!activeQuery.hasNextPage && posts.length > 0 && (
            <p
              className="py-10 text-center text-sm"
              style={{ color: 'var(--text-s)' }}
            >
              You're all caught up ✦
            </p>
          )}

          {/* Empty state — Following tab, no follows yet */}
          {activeTab === 'following' && session && posts.length === 0 && !activeQuery.isLoading && !activeQuery.isError && (
            <div className="py-16 flex flex-col items-center gap-3 px-8 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                style={{ background: 'var(--accent-bg)' }}
              >
                ✦
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-h)' }}>
                Nothing here yet
              </p>
              <p className="text-sm" style={{ color: 'var(--text-s)' }}>
                Follow some people to see their posts here.
              </p>
            </div>
          )}

          {/* Empty state — For You, no posts at all */}
          {activeTab === 'forYou' && posts.length === 0 && !activeQuery.isLoading && !activeQuery.isError && (
            <div className="py-16 flex flex-col items-center gap-3 px-8 text-center">
              <p className="font-semibold" style={{ color: 'var(--text-h)' }}>
                No posts yet
              </p>
              <p className="text-sm" style={{ color: 'var(--text-s)' }}>
                Be the first to post something.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
