import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/server/auth/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'

export const followUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { targetUserId } = data as unknown as { targetUserId: string }

    if (userId === targetUserId) {
      throw new Error("You cannot follow yourself")
    }

    const existingFollow = await db.query.follow.findFirst({
      where: {
        followerId: userId,
        followedId: targetUserId,
      }
    })

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
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { targetUserId } = data as unknown as { targetUserId: string }

    await db.delete(schema.follow).where(
      and(
        eq(schema.follow.followerId, userId),
        eq(schema.follow.followedId, targetUserId)
      )
    )

    return { success: true }
  })
