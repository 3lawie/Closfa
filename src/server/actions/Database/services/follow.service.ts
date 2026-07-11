import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'

const followInput = z.object({ targetUserId: z.string().min(1) })

export const followUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(followInput)
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { targetUserId } = data

    if (userId === targetUserId) {
      throw new Error("You cannot follow yourself")
    }

    const [existingFollow] = await db.select()
      .from(schema.follow)
      .where(and(
        eq(schema.follow.followerId, userId),
        eq(schema.follow.followedId, targetUserId)
      ))
      .limit(1)

    if (existingFollow) {
      return { success: true, message: "Already following" }
    }

    await db.insert(schema.follow).values({
      followerId: userId,
      followedId: targetUserId,
    })

    return { success: true }
  })

export const unfollowUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(followInput)
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { targetUserId } = data

    await db.delete(schema.follow).where(
      and(
        eq(schema.follow.followerId, userId),
        eq(schema.follow.followedId, targetUserId)
      )
    )

    return { success: true }
  })
