import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { and, eq, inArray } from 'drizzle-orm'
import { schema, profileRoleEnum } from '@/server/db/schema'
import { getProfilePermission, ROLE_LEVELS, getGlobalPermission } from '../verifiers/permissions'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { verifyTurnstileToken } from '@/server/lib/turnstile'
import { queries, w } from '@/server/queries'
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

const removeModeratorInput = z.object({
  targetUserId: z.string().min(1),
  profileId: z.string().min(1),
})
type RemoveModeratorInput = z.infer<typeof removeModeratorInput>

/** Inverse of assignModerator — same authorization gate, since granting and revoking team access are symmetric privileges. */
export const removeModerator = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(removeModeratorInput)
  .handler(async ({ data, context }: { data: RemoveModeratorInput; context: { session: { userId: string } } }): Promise<ServerResult<{ targetUserId: string }>> => {
    const { userId } = context.session
    const { targetUserId, profileId } = data

    try {
      const perm = await getProfilePermission(userId, profileId)
      if (!perm.authorized || !perm.canAssignModerator) {
        return err('FORBIDDEN', 'Insufficient permissions to remove a team member')
      }

      const target = await db.query.profileMember.findFirst({
        where: w({ profileId, userId: targetUserId }),
      })
      if (!target) {
        return err('BAD_REQUEST', 'That user is not on this profile\'s team')
      }

      // Leaving the team yourself is always allowed — you can only ever drop
      // your own privilege, never someone else's, so it bypasses the
      // escalation check below (which exists to stop A demoting/removing B).
      const isSelfRemoval = targetUserId === userId
      if (!isSelfRemoval && perm.level <= ROLE_LEVELS[target.role as keyof typeof ROLE_LEVELS]) {
        return err('FORBIDDEN', 'You cannot remove a team member at or above your own level')
      }

      await db.delete(schema.profileMember)
        .where(and(eq(schema.profileMember.profileId, profileId), eq(schema.profileMember.userId, targetUserId)))

      await db.insert(schema.auditLog).values({
        actorId: userId,
        action: 'revoke_role',
        targetType: 'user',
        targetId: targetUserId,
        reason: `Removed role ${target.role} from profile ${profileId}`,
      })

      return ok({ targetUserId })
    } catch (e) {
      logger.error('removeModerator failed', { userId, profileId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to remove team member')
    }
  })

/** Current viewer's own profile-scoped permission flags — lets the UI decide whether to render assign/remove controls at all. */
export const getMyProfilePermissionFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ profileId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    return await getProfilePermission(context.session.userId, data.profileId)
  })

export type ProfileModeratorRow = {
  userId: string
  role: 'co_owner' | 'vip_moderator' | 'moderator'
  assignedAt: Date | null
  user: { userId: string; name: string; nickname: string | null } | null
}

/** Roster of a profile's mod team — read-only, gated on plain team membership (not canAssignModerator) so any member can view who else is on the team. */
export const getModeratorsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ profileId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<ProfileModeratorRow[]>> => {
    const perm = await getProfilePermission(context.session.userId, data.profileId)
    if (!perm.authorized) {
      return err('FORBIDDEN', 'You are not on this profile\'s team')
    }

    try {
      const members = await queries.profile.getModerators(data.profileId)
      // profileMember has two FKs to `user` (userId and assignedBy); Drizzle's
      // relational query builder mistypes the disambiguated one-to-one `user`
      // relation as an array here even though the config declares `r.one.user`
      // and the runtime result is always a single row (or null) per member —
      // this cast corrects the type, it doesn't change behavior.
      return ok(members as unknown as ProfileModeratorRow[])
    } catch (e) {
      logger.error('getModerators failed', { profileId: data.profileId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to load team roster')
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

    // Bot gate on the abuse-prone report form — PostCard.tsx's report dialog
    // renders TurnstileWidget and passes the resulting token here.
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
        let postId: string | null = null
        if (reportData.targetType === 'post') {
          const [row] = await db.select({ author_id: schema.post.author_id }).from(schema.post).where(eq(schema.post.postId, reportData.targetId)).limit(1)
          authorId = row?.author_id ?? null
          postId = reportData.targetId
        } else if (reportData.targetType === 'comment') {
          const [row] = await db.select({ userId: schema.comment.userId, postId: schema.comment.postId }).from(schema.comment).where(eq(schema.comment.comment_id, reportData.targetId)).limit(1)
          authorId = row?.userId ?? null
          postId = row?.postId ?? null
        } else {
          authorId = reportData.targetId
        }

        if (authorId && authorId !== userId) {
          await db.insert(schema.notification).values({
            userId: authorId,
            actorId: null,
            type: 'moderation',
            entityId: reportData.targetId,
            postId,
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

type PendingReport = Awaited<ReturnType<typeof queries.report.getPending>>[number] & { preview: string | null }

/** Truncated content preview per report target — moderators shouldn't have to guess what a report is about from a truncated id. */
async function attachReportPreviews(reports: Awaited<ReturnType<typeof queries.report.getPending>>): Promise<PendingReport[]> {
  const postIds = reports.filter((r) => r.targetType === 'post').map((r) => r.targetId)
  const commentIds = reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId)
  const userIds = reports.filter((r) => r.targetType === 'user').map((r) => r.targetId)

  const [posts, comments, users] = await Promise.all([
    postIds.length > 0
      ? db.select({ id: schema.post.postId, content: schema.post.content }).from(schema.post).where(inArray(schema.post.postId, postIds))
      : Promise.resolve([]),
    commentIds.length > 0
      ? db.select({ id: schema.comment.comment_id, content: schema.comment.comment }).from(schema.comment).where(inArray(schema.comment.comment_id, commentIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db.select({ id: schema.user.userId, name: schema.user.name, nickname: schema.user.nickname }).from(schema.user).where(inArray(schema.user.userId, userIds))
      : Promise.resolve([]),
  ])

  const truncate = (s: string | null) => (s ? (s.length > 140 ? `${s.slice(0, 140)}…` : s) : null)
  const postPreview = new Map(posts.map((p) => [p.id, truncate(p.content)]))
  const commentPreview = new Map(comments.map((c) => [c.id, truncate(c.content)]))
  const userPreview = new Map(users.map((u) => [u.id, `${u.name}${u.nickname ? ` (@${u.nickname})` : ''}`]))

  return reports.map((r) => ({
    ...r,
    preview:
      r.targetType === 'post' ? (postPreview.get(r.targetId) ?? null) :
      r.targetType === 'comment' ? (commentPreview.get(r.targetId) ?? null) :
      r.targetType === 'user' ? (userPreview.get(r.targetId) ?? null) :
      null,
  }))
}

export const getPendingReportsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }): Promise<ServerResult<PendingReport[]>> => {
    const { userId } = context.session

    const perm = await getGlobalPermission(userId)
    if (!perm.authorized || !perm.canReviewReports) {
      return err('FORBIDDEN', 'Insufficient permissions to view reports')
    }

    const reports = await queries.report.getPending()
    return ok(await attachReportPreviews(reports))
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

const pinPostInput = z.object({ postId: z.string().min(1), profileId: z.string().min(1) })

/** Pin one of the profile owner's own posts to the top of their profile page. Single pin — setting a new one replaces the old. */
export const pinPostFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(pinPostInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: string }>> => {
    const { userId } = context.session
    const { postId, profileId } = data

    try {
      const perm = await getProfilePermission(userId, profileId)
      if (!perm.authorized || !perm.canPinPost) {
        return err('FORBIDDEN', 'Insufficient permissions to pin a post on this profile')
      }

      const profile = await db.query.profile.findFirst({ where: w({ profile_id: profileId }) })
      if (!profile) return err('NOT_FOUND', 'Profile not found')

      const [post] = await db.select({ author_id: schema.post.author_id, is_published: schema.post.is_published }).from(schema.post).where(eq(schema.post.postId, postId))
      if (!post) return err('NOT_FOUND', 'Post not found')
      if (post.author_id !== profile.userId) {
        return err('BAD_REQUEST', 'Only the profile owner\'s own posts can be pinned to it')
      }
      if (!post.is_published) {
        return err('BAD_REQUEST', 'Only a published post can be pinned')
      }

      await db.update(schema.profile).set({ pinnedPostId: postId, updatedAt: new Date() }).where(eq(schema.profile.profile_id, profileId))

      return ok({ postId })
    } catch (e) {
      logger.error('pinPost failed', { userId, profileId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to pin post')
    }
  })

export const unpinPostFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ profileId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ profileId: string }>> => {
    const { userId } = context.session
    const { profileId } = data

    try {
      const perm = await getProfilePermission(userId, profileId)
      if (!perm.authorized || !perm.canPinPost) {
        return err('FORBIDDEN', 'Insufficient permissions to unpin a post on this profile')
      }

      await db.update(schema.profile).set({ pinnedPostId: null, updatedAt: new Date() }).where(eq(schema.profile.profile_id, profileId))

      return ok({ profileId })
    } catch (e) {
      logger.error('unpinPost failed', { userId, profileId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to unpin post')
    }
  })
