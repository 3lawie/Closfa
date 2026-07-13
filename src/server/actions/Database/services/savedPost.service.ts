import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { queries } from '@/server/queries'

const toggleSavePostInput = z.object({ postId: z.string().min(1) })

export const toggleSavePostFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(toggleSavePostInput)
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { postId } = data
    try {
      const removed = await db
        .delete(schema.savedPost)
        .where(and(eq(schema.savedPost.postId, postId), eq(schema.savedPost.userId, userId)))
        .returning({ id: schema.savedPost.id })

      if (removed.length > 0) {
        return { ok: true as const, data: { saved: false } }
      }

      const added = await db
        .insert(schema.savedPost)
        .values({ postId, userId })
        .onConflictDoNothing()
        .returning({ id: schema.savedPost.id })

      return { ok: true as const, data: { saved: added.length > 0 } }
    } catch (err) {
      console.error('[toggleSavePostFn] Failed:', err)
      return {
        ok: false as const,
        error: 'INTERNAL_ERROR' as const,
        message: 'Failed to update saved status',
      }
    }
  })

export const getSavedPostsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    const { userId } = context.session
    return await queries.savedPost.getByUser(userId)
  })
