import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { createNotification } from './notification.service'

const followInput = z.object({ targetUserId: z.string().min(1) })

export const followUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(followInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ alreadyFollowing: boolean }>> => {
    const { userId } = context.session
    const { targetUserId } = data

    try {
      if (userId === targetUserId) {
        return err('BAD_REQUEST', 'You cannot follow yourself')
      }

      const [existingFollow] = await db
        .select()
        .from(schema.follow)
        .where(and(eq(schema.follow.followerId, userId), eq(schema.follow.followedId, targetUserId)))
        .limit(1)

      if (existingFollow) {
        return ok({ alreadyFollowing: true })
      }

      await db.insert(schema.follow).values({
        followerId: userId,
        followedId: targetUserId,
      })

      await createNotification({ recipientId: targetUserId, actorId: userId, type: 'follow', entityId: null })

      return ok({ alreadyFollowing: false })
    } catch (e) {
      logger.error('followUser failed', { userId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to follow user')
    }
  })

export const unfollowUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(followInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ unfollowed: true }>> => {
    const { userId } = context.session
    const { targetUserId } = data

    try {
      await db
        .delete(schema.follow)
        .where(and(eq(schema.follow.followerId, userId), eq(schema.follow.followedId, targetUserId)))

      return ok({ unfollowed: true })
    } catch (e) {
      logger.error('unfollowUser failed', { userId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to unfollow user')
    }
  })
