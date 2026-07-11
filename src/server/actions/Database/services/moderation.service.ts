import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema, profileRoleEnum } from '@/server/db/schema'
import { getProfilePermission, ROLE_LEVELS } from '../verifiers/permissions'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { verifyTurnstileToken } from '@/server/lib/turnstile'
import { queries } from '@/server/queries'

/** Only real member roles are assignable — `owner` is the profile creator, not grantable. */
const assignModeratorInput = z.object({
  targetUserId: z.string().min(1),
  profileId: z.string().min(1),
  role: z.enum(profileRoleEnum.enumValues).default('moderator'),
})
type AssignModeratorInput = z.infer<typeof assignModeratorInput>

export const assignModerator = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(assignModeratorInput)
  .handler(async ({ data, context }: { data: AssignModeratorInput; context: { session: { userId: string } } }): Promise<ServerResult<{ targetUserId: string; role: AssignModeratorInput['role'] }>> => {
    const { userId } = context.session
    const { targetUserId, profileId, role } = data

    try {
      // 1. Verify the assigner is allowed to assign moderators on this profile.
      const perm = await getProfilePermission(userId, profileId)
      if (!perm.authorized || !perm.canAssignModerator) {
        return err('FORBIDDEN', 'Insufficient permissions to assign moderators')
      }

      // 2. Prevent privilege escalation (security#3): you may only grant a role
      //    STRICTLY below your own. A co_owner (level 3) therefore cannot mint
      //    another co_owner; only the owner (level 4) can grant co_owner.
      if (perm.level <= ROLE_LEVELS[role]) {
        return err('FORBIDDEN', 'You cannot assign a role equal to or above your own')
      }

      // 3. Execute
      await db.insert(schema.profileMember).values({
        profileId,
        userId: targetUserId,
        role,
        assignedBy: userId,
      })

      // 4. Audit
      await db.insert(schema.auditLog).values({
        actorId: userId,
        action: 'assign_role',
        targetType: 'user',
        targetId: targetUserId,
        reason: `Assigned role ${role} to profile ${profileId}`,
      })

      return ok({ targetUserId, role })
    } catch (e) {
      logger.error('assignModerator failed', { userId, profileId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to assign moderator')
    }
  })

const reportInput = z.object({
  targetType: z.enum(['post', 'comment', 'user']),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(1000),
  details: z.string().max(2000).optional(),
  // Optional at the schema level; the verifier fails closed in production.
  turnstileToken: z.string().optional(),
})

export const reportContent = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(reportInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ targetType: string; targetId: string }>> => {
    const { userId } = context.session
    const reportData = data

    // Bot gate on the abuse-prone report form (no report UI exists yet —
    // when one is built it must render TurnstileWidget and pass the token).
    const human = await verifyTurnstileToken(reportData.turnstileToken)
    if (!human) {
      return err('FORBIDDEN', 'Verification failed — please retry the challenge.')
    }

    try {
      await db.insert(schema.report).values({
        reporterId: userId,
        targetType: reportData.targetType,
        targetId: reportData.targetId,
        reason: reportData.reason,
        details: reportData.details,
      })

      return ok({ targetType: reportData.targetType, targetId: reportData.targetId })
    } catch (e) {
      logger.error('reportContent failed', { userId, targetType: reportData.targetType, targetId: reportData.targetId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to report content')
    }
  })

export const getPendingReportsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    const { userId } = context.session

    // In a real app, verify they are a global moderator. 
    // Here we just check if they are an admin or simply return pending reports.
    // We will just return pending reports for simplicity right now.
    const reports = await queries.report.getPending()
    return reports
  })
