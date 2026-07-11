import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { updateProfileValidation } from '@/verification/profile.validation'
import { eq } from 'drizzle-orm'
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
