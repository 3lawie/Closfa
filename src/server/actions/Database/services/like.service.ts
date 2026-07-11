import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'

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
  .handler(async ({ data, context }) => {
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
        return { ok: true as const, data: { liked: false, likes: row?.likes ?? 0 } }
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
        return { ok: true as const, data: { liked: true, likes: row?.likes ?? 0 } }
      }

      // Rare race: a concurrent request re-liked between our delete and insert.
      const current = await db
        .select({ likes: schema.post.likes })
        .from(schema.post)
        .where(eq(schema.post.postId, postId))
      return { ok: true as const, data: { liked: true, likes: current[0]?.likes ?? 0 } }
    } catch (err) {
      console.error('[toggleLike] Failed:', err)
      return { ok: false as const, error: 'INTERNAL_ERROR' as const, message: 'Failed to update like' }
    }
  })
