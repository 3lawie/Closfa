import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema, profileRoleEnum } from '@/server/db/schema'
import { getProfilePermission, ROLE_LEVELS } from '../verifiers/permissions'

/** Only real member roles are assignable — `owner` is the profile creator, not grantable. */
const assignModeratorInput = z.object({
  targetUserId: z.string().min(1),
  profileId: z.string().min(1),
  role: z.enum(profileRoleEnum.enumValues).default('moderator'),
})
type AssignModeratorInput = z.infer<typeof assignModeratorInput>

export const assignModerator = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(assignModeratorInput)
  .handler(async ({ data, context }: { data: AssignModeratorInput; context: { session: { userId: string } } }) => {
    const { userId } = context.session
    const { targetUserId, profileId, role } = data

    // 1. Verify the assigner is allowed to assign moderators on this profile.
    const perm = await getProfilePermission(userId, profileId)
    if (!perm.authorized || !perm.canAssignModerator) {
      throw new Error('Insufficient permissions to assign moderators')
    }

    // 2. Prevent privilege escalation (security#3): you may only grant a role
    //    STRICTLY below your own. A co_owner (level 3) therefore cannot mint
    //    another co_owner; only the owner (level 4) can grant co_owner.
    if (perm.level <= ROLE_LEVELS[role]) {
      throw new Error('You cannot assign a role equal to or above your own')
    }

    // 3. Execute
    await db.insert(schema.profileMember).values({
      profileId,
      userId: targetUserId,
      role,
      assignedBy: userId,
    })

    // 3. Audit
    await db.insert(schema.auditLog).values({
      actorId: userId,
      action: 'assign_role',
      targetType: 'user',
      targetId: targetUserId,
      reason: `Assigned role ${role} to profile ${profileId}`,
    })

    return { success: true }
  })

const reportInput = z.object({
  targetType: z.enum(['post', 'comment', 'user']),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(1000),
  details: z.string().max(2000).optional(),
})

export const reportContent = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(reportInput)
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const reportData = data

    await db.insert(schema.report).values({
      reporterId: userId,
      targetType: reportData.targetType,
      targetId: reportData.targetId,
      reason: reportData.reason,
      details: reportData.details,
    })

    return { success: true }
  })
