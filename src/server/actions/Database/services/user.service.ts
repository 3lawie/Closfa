import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyIsOwner } from '../verifiers/auth'
import { createId } from '@paralleldrive/cuid2'

export async function upsertAuthUser(userInfo: {
  sub: string;
  name: string;
  email: string;
  authProvider: string;
  email_verified?: boolean;
}) {
  let user = await db.query.user.findFirst({
    where: { authProviderId: userInfo.sub },
  })

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
  .middleware([authMiddleware])
  // .validator(profileSchema) // TODO: Add Zod validation
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const profileData = data as any // Replace with valid type once Zod is added

    // 1. Verify: user can only update their own profile
    // Wait, the user is updating their own profile based on their session ID.
    // If they are trying to update another profile, verifyIsOwner would be used.
    // In this case, we just use their session userId.

    // 2. Execute
    await db.update(schema.profile)
      .set({
        bio: profileData.bio,
        website: profileData.website,
        location: profileData.location,
        image: profileData.image, // mediaId
        updatedAt: new Date(),
      })
      .where(eq(schema.profile.userId, userId))

    // 3. Respond
    return { success: true }
  })
