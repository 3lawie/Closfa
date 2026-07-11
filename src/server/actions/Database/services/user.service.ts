import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { updateProfileValidation } from '@/verification/profile.validation'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

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

    await db.insert(schema.user).values({
      userId,
      name: userInfo.name,
      nickname: null, // Must be claimed during onboarding
      email: userInfo.email,
      authProviderId: userInfo.sub,
      authProvider: userInfo.authProvider,
      emailVerified: userInfo.email_verified ?? false,
    })

    // Create the user's profile record (one-to-one with user)
    await db.insert(schema.profile).values({
      profile_id: createId(),
      userId,
      isVerified: false,
    })

    user = { userId, authProviderId: userInfo.sub, nickname: null } as any
  }

  return user!
}

export const updateProfile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(updateProfileValidation)
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const profileData = data

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

    // 3. Respond
    return { success: true }
  })
