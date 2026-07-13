import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { eq } from 'drizzle-orm'
import { schema, profileRoleEnum } from '@/server/db/schema'
import { getProfilePermission, ROLE_LEVELS, getGlobalPermission } from '../verifiers/permissions'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { verifyTurnstileToken } from '@/server/lib/turnstile'
import { queries } from '@/server/queries'
import { deletePostRecord } from './post.service'

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

      // Best-effort: the author never otherwise learns their content was
      // reported (only the site-wide moderator queue sees it). actorId is
      // deliberately left null — naming the reporter to the reported party
      // would invite retaliation, standard trust-and-safety practice.
      // Failure here must not fail the report itself.
      try {
        let authorId: string | null = null
        if (reportData.targetType === 'post') {
          const [row] = await db.select({ author_id: schema.post.author_id }).from(schema.post).where(eq(schema.post.postId, reportData.targetId)).limit(1)
          authorId = row?.author_id ?? null
        } else if (reportData.targetType === 'comment') {
          const [row] = await db.select({ userId: schema.comment.userId }).from(schema.comment).where(eq(schema.comment.comment_id, reportData.targetId)).limit(1)
          authorId = row?.userId ?? null
        } else {
          authorId = reportData.targetId
        }

        if (authorId && authorId !== userId) {
          await db.insert(schema.notification).values({
            userId: authorId,
            actorId: null,
            type: 'moderation',
            entityId: reportData.targetId,
            message: `Your ${reportData.targetType} was reported and is being reviewed.`,
          })
        }
      } catch (notifyError) {
        logger.error('reportContent: author notification failed', { userId, targetType: reportData.targetType, targetId: reportData.targetId }, notifyError instanceof Error ? notifyError : undefined)
      }

      return ok({ targetType: reportData.targetType, targetId: reportData.targetId })
    } catch (e) {
      logger.error('reportContent failed', { userId, targetType: reportData.targetType, targetId: reportData.targetId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to report content')
    }
  })

export const getPendingReportsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }): Promise<ServerResult<Awaited<ReturnType<typeof queries.report.getPending>>>> => {
    const { userId } = context.session

    const perm = await getGlobalPermission(userId)
    if (!perm.authorized || !perm.canReviewReports) {
      return err('FORBIDDEN', 'Insufficient permissions to view reports')
    }

    const reports = await queries.report.getPending()
    return ok(reports)
  })

const resolveReportInput = z.object({
  reportId: z.string(),
  action: z.enum(['delete', 'dismiss', 'ban_user', 'warn_user']),
})

export const resolveReportFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(resolveReportInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ success: true }>> => {
    const { userId } = context.session
    const { reportId, action } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canReviewReports) {
        return err('FORBIDDEN', 'Insufficient permissions to resolve reports')
      }

      const [report] = await db.select().from(schema.report).where(eq(schema.report.id, reportId)).limit(1)
      if (!report) {
        return err('NOT_FOUND', 'Report not found')
      }

      if (action === 'delete') {
        // Deleting the reported content needs escalating permission by type,
        // mirroring the global capability tiers: comments are senior_moderator+,
        // posts are admin+ (matches getGlobalPermission's canDeleteComment /
        // canDeleteContent thresholds).
        if (report.targetType === 'comment') {
          if (!perm.canDeleteComment) {
            return err('FORBIDDEN', 'Insufficient permissions to delete this content')
          }
          await db.delete(schema.commentReply).where(eq(schema.commentReply.parent_comment_id, report.targetId))
          await db.delete(schema.comment).where(eq(schema.comment.comment_id, report.targetId))
        } else if (report.targetType === 'post') {
          if (!perm.canDeleteContent) {
            return err('FORBIDDEN', 'Insufficient permissions to delete this content')
          }
          await deletePostRecord(report.targetId)
        } else {
          return err('BAD_REQUEST', `Cannot delete a report target of type "${report.targetType}"`)
        }

        await db.insert(schema.auditLog).values({
          actorId: userId,
          action: report.targetType === 'comment' ? 'delete_comment' : 'delete_post',
          targetType: report.targetType,
          targetId: report.targetId,
          reason: `Resolved report ${reportId} by deleting content`,
        })
      } else if (action === 'ban_user' || action === 'warn_user') {
        if (report.targetType !== 'user') {
          return err('BAD_REQUEST', `Cannot ${action} a report target of type "${report.targetType}"`)
        }

        if (action === 'ban_user') {
          if (!perm.canBanUser) {
            return err('FORBIDDEN', 'Insufficient permissions to ban this user')
          }
          await db.update(schema.user)
            .set({ isBanned: true, bannedAt: new Date(), banReason: report.reason })
            .where(eq(schema.user.userId, report.targetId))
        } else {
          if (!perm.canWarnUser) {
            return err('FORBIDDEN', 'Insufficient permissions to warn this user')
          }
          // Warnings carry no account-level effect — just a durable audit
          // trail plus a direct notice to the warned user, same 'moderation'
          // notification pattern reportContent already uses for report-filed.
          await db.insert(schema.notification).values({
            userId: report.targetId,
            actorId: null,
            type: 'moderation',
            entityId: null,
            message: `You received a warning: ${report.reason}`,
          })
        }

        await db.insert(schema.auditLog).values({
          actorId: userId,
          action,
          targetType: 'user',
          targetId: report.targetId,
          reason: `Resolved report ${reportId}: ${action}`,
        })
      }

      await db.update(schema.report)
        .set({ status: 'resolved', reviewedAt: new Date(), reviewedBy: userId })
        .where(eq(schema.report.id, reportId))

      return ok({ success: true })
    } catch (e) {
      logger.error('resolveReport failed', { userId, reportId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to resolve report')
    }
  })
