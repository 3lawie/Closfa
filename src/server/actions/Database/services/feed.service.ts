import { createServerFn } from '@tanstack/react-start'
import { queries } from '@/server/queries'
import { authMiddleware, rateLimiterMiddleWare, SessionData } from '@/server/lib/middleware'
import type { FeedPage } from '@/lib/entities/Post'
import z from 'zod'

const FEED_LIMIT = 15

const feedInput = z.object({
  cursor: z.string().optional(),
  page: z.number().optional(),
  direction: z.enum(['older', 'newer']).optional(),
  limit: z.number().optional()
})
type FeedInput = z.infer<typeof feedInput>

/** "For You" feed — all published posts. No auth required. */
export const getFeedFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator((data?: FeedInput) => data)
  .handler(async ({ data, context }): Promise<FeedPage> => {
    const { page = 1, limit = FEED_LIMIT } = data ?? {}
    const posts = await queries.post.getFeed(limit, page)
    const nextPage = posts.length === limit ? page + 1 : null
    return { posts: posts as unknown as FeedPage["posts"], nextCursor: null, nextPage: nextPage ?? undefined }
  })

/** "Following" feed — posts from followed users. Requires auth. */
export const getFollowingFeedFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data?: FeedInput) => data)
  .handler(async ({ data, context }): Promise<FeedPage> => {
    const { session } = context
    const { cursor, direction = 'older', limit = FEED_LIMIT } = data ?? {}
    const posts = await queries.post.getFollowingFeed(session.userId, limit, cursor, direction)
    
    let nextCursor = null;
    let previousCursor = null;

    if (posts.length > 0) {
       const first = posts[0];
       const last = posts[posts.length - 1];

       if (direction === 'older' && posts.length === limit) {
         nextCursor = `${last.published_at?.toISOString()}_${last.postId}`;
       }
       
       if (direction === 'newer' && posts.length === limit) {
         previousCursor = `${first.published_at?.toISOString()}_${first.postId}`;
       }
       
       if (!cursor) {
         previousCursor = `${first.published_at?.toISOString()}_${first.postId}`;
         if (posts.length === limit) {
           nextCursor = `${last.published_at?.toISOString()}_${last.postId}`;
         }
       }
    }

    return { posts: posts as unknown as FeedPage['posts'], nextCursor, previousCursor: previousCursor ?? undefined }
  })
