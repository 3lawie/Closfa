import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyIsOwner } from '../verifiers/auth'

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
