import { createServerFn } from '@tanstack/react-start'
import { queries } from '@/server/queries'
import { authMiddleware } from '@/server/lib/middleware'
import type { FeedPage } from '@/lib/entities/Post'

const FEED_LIMIT = 15

type FeedInput = { cursor?: string; limit?: number }

/** "For You" feed — all published posts. No auth required. */
export const getFeedFn = createServerFn({ method: 'GET' })
  .inputValidator((data?: FeedInput) => data)
  .handler(async ({ data }): Promise<FeedPage> => {
    const { cursor, limit = FEED_LIMIT } = data ?? {}
    const posts = await queries.post.getFeed(limit, cursor)
    const last = posts[posts.length - 1]
    const nextCursor =
      posts.length === limit && last?.published_at
        ? last.published_at.toISOString()
        : null
    return { posts: posts as unknown as FeedPage['posts'], nextCursor }
  })

/** "Following" feed — posts from followed users. Requires auth. */
export const getFollowingFeedFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data?: FeedInput) => data)
  .handler(async ({ data, context }): Promise<FeedPage> => {
    const { session } = context
    const { cursor, limit = FEED_LIMIT } = data ?? {}
    const posts = await queries.post.getFollowingFeed(session.userId, limit, cursor)
    const last = posts[posts.length - 1]
    const nextCursor =
      posts.length === limit && last?.published_at
        ? last.published_at.toISOString()
        : null
    return { posts: posts as unknown as FeedPage['posts'], nextCursor }
  })
