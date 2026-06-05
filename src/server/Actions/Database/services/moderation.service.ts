import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/server/auth/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { getProfilePermission } from '../verifiers/permissions'
import { eq, and } from 'drizzle-orm'

export const assignModerator = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { targetUserId, profileId, role } = data as any

    // 1. Verify
    const perm = await getProfilePermission(userId, profileId)
    if (!perm.authorized || !perm.canAssignModerator) {
      throw new Error('Insufficient permissions to assign moderators')
    }

    // 2. Execute
    await db.insert(schema.profileMember).values({
      profileId,
      userId: targetUserId,
      role: role || 'moderator',
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

export const reportContent = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const reportData = data as any

    await db.insert(schema.report).values({
      reporterId: userId,
      targetType: reportData.targetType,
      targetId: reportData.targetId,
      reason: reportData.reason,
      details: reportData.details,
    })

    return { success: true }
  })
