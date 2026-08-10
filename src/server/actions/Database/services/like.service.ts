import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { authMiddleware, optionalAuthMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { queries } from '@/server/queries'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { createNotification } from './notification.service'
import { logger } from '@/server/lib/logger'

const toggleLikeInput = z.object({ postId: z.string().min(1) })

/**
 * Toggle the current user's like on a post and keep the denormalized
 * `post.likes` counter (which the feed ranks on) in sync.
 *
 * The neon-http driver has NO interactive transactions, so this is written as
 * idempotent single-row operations guarded by the post_like unique constraint:
 * try to remove an existing like first (unlike); if nothing was removed, insert
 * one (like). The counter is adjusted with a SQL expression, floored at 0.
 */
export const toggleLike = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(toggleLikeInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ liked: boolean; likes: number }>> => {
    const { userId } = context.session
    const { postId } = data

    try {
      const removed = await db
        .delete(schema.postLike)
        .where(and(eq(schema.postLike.postId, postId), eq(schema.postLike.userId, userId)))
        .returning({ id: schema.postLike.id })

      if (removed.length > 0) {
        const [row] = await db
          .update(schema.post)
          .set({ likes: sql`GREATEST(${schema.post.likes} - 1, 0)` })
          .where(eq(schema.post.postId, postId))
          .returning({ likes: schema.post.likes })
        return ok({ liked: false, likes: row?.likes ?? 0 })
      }

      const added = await db
        .insert(schema.postLike)
        .values({ postId, userId })
        .onConflictDoNothing()
        .returning({ id: schema.postLike.id })

      if (added.length > 0) {
        const [row] = await db
          .update(schema.post)
          .set({ likes: sql`${schema.post.likes} + 1` })
          .where(eq(schema.post.postId, postId))
          .returning({ likes: schema.post.likes })

        const [authorRow] = await db
          .select({ authorId: schema.post.author_id })
          .from(schema.post)
          .where(eq(schema.post.postId, postId))
        if (authorRow) {
          await createNotification({ recipientId: authorRow.authorId, actorId: userId, type: 'like', entityId: postId, postId })
        }

        return ok({ liked: true, likes: row?.likes ?? 0 })
      }

      // Rare race: a concurrent request re-liked between our delete and insert.
      const current = await db
        .select({ likes: schema.post.likes })
        .from(schema.post)
        .where(eq(schema.post.postId, postId))
      return ok({ liked: true, likes: current[0]?.likes ?? 0 })
    } catch (e) {
      logger.error('toggleLike failed', { scope: 'like.service' }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update like')
    }
  })

type PostLiker = { userId: string; name: string; nickname: string | null }

/** Short "Liked by" list for a post — public, matching getPostFn's own reach (guests can already see who liked, same as the like count itself). */
export const getPostLikersFn = createServerFn({ method: 'GET' })
  .middleware([optionalAuthMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string().min(1) }))
  .handler(async ({ data }): Promise<ServerResult<PostLiker[]>> => {
    try {
      const likes = await queries.post.getLikers(data.postId)
      // Drizzle mistypes this one-to-one `user` relation as an array in some
      // configs (see moderation.service.ts's ProfileModeratorRow comment for
      // the same quirk) — runtime always returns a single row per like.
      const likers = (likes as unknown as { user: PostLiker | null }[])
        .map((l) => l.user)
        .filter((u): u is PostLiker => u !== null)
      return ok(likers)
    } catch (e) {
      logger.error('getPostLikers failed', { scope: 'like.service' }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to load likers')
    }
  })
