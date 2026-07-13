import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { queries } from '@/server/queries'

const blockInput = z.object({ targetUserId: z.string().min(1) })

export const blockUserFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(blockInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ alreadyBlocked: boolean }>> => {
    const { userId } = context.session
    const { targetUserId } = data

    try {
      if (userId === targetUserId) {
        return err('BAD_REQUEST', 'You cannot block yourself')
      }

      const [existingBlock] = await db
        .select()
        .from(schema.userBlock)
        .where(and(eq(schema.userBlock.blockerId, userId), eq(schema.userBlock.blockedId, targetUserId)))
        .limit(1)

      if (existingBlock) {
        return ok({ alreadyBlocked: true })
      }

      await db.insert(schema.userBlock).values({
        blockerId: userId,
        blockedId: targetUserId,
      })

      return ok({ alreadyBlocked: false })
    } catch (e) {
      logger.error('blockUserFn failed', { userId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to block user')
    }
  })

export const getBlockedUsersFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    return await queries.userBlock.getBlockedByUser(context.session.userId)
  })

export const unblockUserFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(blockInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ unblocked: true }>> => {
    const { userId } = context.session
    const { targetUserId } = data

    try {
      await db
        .delete(schema.userBlock)
        .where(and(eq(schema.userBlock.blockerId, userId), eq(schema.userBlock.blockedId, targetUserId)))

      return ok({ unblocked: true })
    } catch (e) {
      logger.error('unblockUserFn failed', { userId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to unblock user')
    }
  })
