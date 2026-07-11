import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, optionalAuthMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { updateProfileValidation } from '@/verification/profile.validation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { queries } from '@/server/queries'
import { createId } from '@paralleldrive/cuid2'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'

export async function upsertAuthUser(userInfo: {
  sub: string;
  name: string;
  email: string;
  authProvider: string;
  email_verified?: boolean;
}) {
  let [user] = await db.select().from(schema.user).where(eq(schema.user.authProviderId, userInfo.sub)).limit(1)

  if (!user) {
    const userId = createId()

    // .returning() gives back the real, fully-typed inserted row — no cast.
    const [inserted] = await db.insert(schema.user).values({
      userId,
      name: userInfo.name,
      nickname: null, // Must be claimed during onboarding
      email: userInfo.email,
      authProviderId: userInfo.sub,
      authProvider: userInfo.authProvider,
      emailVerified: userInfo.email_verified ?? false,
    }).returning()

    // Create the user's profile record (one-to-one with user)
    await db.insert(schema.profile).values({
      profile_id: createId(),
      userId,
      isVerified: false,
    })

    user = inserted
  }

  return user
}

export const updateProfile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(updateProfileValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ updated: true }>> => {
    const { userId } = context.session
    const profileData = data

    try {
      // Ownership is implicit: a user can only update their OWN profile, keyed by
      // the session userId — never a client-supplied profile id.
      await db.update(schema.profile)
        .set({
          bio: profileData.bio,
          website: profileData.website,
          location: profileData.location,
          avatar: profileData.imageMediaId, // mediaId of an uploaded avatar
          updatedAt: new Date(),
        })
        .where(eq(schema.profile.userId, userId))

      return ok({ updated: true })
    } catch (e) {
      logger.error('updateProfile failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update profile')
    }
  })

export const getUserProfileFn = createServerFn({ method: 'GET' })
  .middleware([optionalAuthMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ nickname: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const { nickname } = data
    const currentUserId = context.session?.userId
    
    // Fetch the user and profile
    const user = await queries.user.getByNickname(nickname)
    if (!user) {
      return null
    }

    // Fetch the user's posts
    const posts = await queries.post.getByAuthor(user.userId)

    // Fetch follower and following counts
    const followers = await db.query.follow.findMany({ where: eq(schema.follow.followedId, user.userId) })
    const following = await db.query.follow.findMany({ where: eq(schema.follow.followerId, user.userId) })

    const isFollowing = currentUserId 
      ? followers.some(f => f.followerId === currentUserId)
      : false

    return {
      user,
      posts,
      stats: {
        followers: followers.length,
        following: following.length,
      },
      isFollowing,
    }
  })
