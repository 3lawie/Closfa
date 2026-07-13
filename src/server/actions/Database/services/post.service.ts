import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, optionalAuthMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { queries } from '@/server/queries'
import { verifyIsOwner } from '../verifiers/auth'
import { getGlobalPermission } from '../verifiers/permissions'
import { eq } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { notifyMentions } from './notification.service'

/** Fetch a single post for the detail route. Public (guests and users). */
const getPostInput = z.object({ postId: z.string().min(1) })
export const getPostFn = createServerFn({ method: 'GET' })
  .middleware([optionalAuthMiddleware, rateLimiterMiddleWare])
  .inputValidator(getPostInput)
  .handler(async ({ data }) => {
    const post = await queries.post.getById(data.postId)
    return post ?? null
  })

/** Validated create-post input — content and/or up to 10 media items. */
const createPostInput = z
  .object({
    content: z.string().max(5000).optional(),
    mediaQuality: z.enum(['compressed', 'original']).default('compressed'),
    media: z
      .array(
        z.object({
          mediaType: z.enum(['image', 'video', 'audio']),
          mediaUrl: z.string().min(1),
          fileName: z.string().min(1),
          mimeType: z.string().min(1),
          fileSize: z.number().int().positive().optional(),
          width: z.number().int().positive().optional(),
          height: z.number().int().positive().optional(),
          duration: z.number().positive().optional().transform(val => val !== undefined ? Math.max(1, Math.round(val)) : undefined).optional(),
        }),
      )
      .max(10)
      .default([]),
    // Optional collab co-author, invited at publish time — pending until
    // they agree (respondToCollabInviteFn), never assumed accepted.
    collaboratorUserId: z.string().optional(),
  })
  .refine((d) => !!d.content?.trim() || d.media.length > 0, {
    message: 'Add some text or at least one media item',
  })

/**
 * Create a post with optional media. The client uploads each file to ImageKit
 * first, then sends the resulting URLs + metadata here. Media rows are
 * normalized so they satisfy the media table's type/dimension CHECK constraints.
 */
export const createPostWithMedia = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(createPostInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: string }>> => {
    const { userId } = context.session
    const { content, media, mediaQuality, collaboratorUserId } = data

    if (collaboratorUserId === userId) {
      return err('BAD_REQUEST', 'You cannot invite yourself as a collaborator')
    }

    try {
      // Ensure the default category exists (post_category is a NOT NULL FK).
      await db.insert(schema.categories).values({ name: 'general' }).onConflictDoNothing()

      // Normalize each media row to satisfy the media CHECK constraints:
      //   image → width/height set, duration null
      //   video → width/height + duration set
      //   audio → width/height null, duration set
      let mediaIds: string[] = []
      if (media.length > 0) {
        const rows = media.map((m) => ({
          user_id: userId,
          media_type: m.mediaType,
          mediaUrl: m.mediaUrl,
          fileName: m.fileName,
          mimeType: m.mimeType,
          fileSize: m.fileSize ?? null,
          width: m.mediaType === 'audio' ? null : m.width ?? null,
          height: m.mediaType === 'audio' ? null : m.height ?? null,
          duration: m.mediaType === 'image' ? null : m.duration ?? null,
        }))
        const inserted = await db
          .insert(schema.media)
          .values(rows)
          .returning({ media_id: schema.media.media_id })
        mediaIds = inserted.map((r) => r.media_id)
      }

      const [postRow] = await db
        .insert(schema.post)
        .values({
          content: content ?? null,
          author_id: userId,
          post_category: 'general',
          post_status: 'published',
          post_type: collaboratorUserId ? 'collab' : 'solo',
          is_published: true,
          published_at: new Date(),
          media_quality: mediaQuality,
        })
        .returning({ postId: schema.post.postId })

      if (mediaIds.length > 0) {
        await db.insert(schema.postToMedia).values(
          mediaIds.map((media_id) => ({ post_id: postRow.postId, media_id })),
        )
      }

      if (collaboratorUserId) {
        await db.insert(schema.postToUser).values({
          post_id: postRow.postId,
          user_id: collaboratorUserId,
          accepted: false,
        })

        try {
          await db.insert(schema.notification).values({
            userId: collaboratorUserId, actorId: userId, type: 'collab_invite', entityId: postRow.postId,
            message: 'invited you to be a collaborator on their post.',
          })
        } catch (notifyError) {
          logger.error('createPostWithMedia: collab notification failed', { postId: postRow.postId }, notifyError instanceof Error ? notifyError : undefined)
        }
      }

      if (content) {
        await notifyMentions(content, userId, postRow.postId)
      }

      return ok({ postId: postRow.postId })
    } catch (e) {
      logger.error('createPostWithMedia failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to create post')
    }
  })

// Shared soft-delete, extracted so moderation-triggered removal
// (moderation.service.ts's resolveReportFn) and owner/admin-triggered removal
// (deletePost below) can't drift apart. Caller is responsible for its own
// authorization check before calling this — it performs no checks itself.
//
// Soft delete (flip status, keep the row) rather than cascade-deleting
// comments/likes/media/ImageKit files: a "removed" post still needs to show
// up — original content and all — on the admin post-control page, which a
// hard delete would make impossible. `is_published: false` reuses the same
// flag the feed queries already filter on, so removed posts disappear from
// feeds/profiles for free without a second exclusion condition to maintain.
export async function deletePostRecord(postId: string): Promise<void> {
  await db.update(schema.post)
    .set({ post_status: 'removed', is_published: false, updatedAt: new Date() })
    .where(eq(schema.post.postId, postId))
}

export const deletePost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: string }>> => {
    const { userId } = context.session
    const { postId } = data

    try {
      const post = await queries.post.getById(postId, true)

      if (!post) {
        return err('NOT_FOUND', 'Post not found')
      }

      const ownershipCheck = verifyIsOwner(userId, post.author_id)
      if (!ownershipCheck.ok) {
        // Not the owner — still allow a global admin to remove it directly,
        // same threshold resolveReportFn already uses for post deletion via
        // the report queue (canDeleteContent, admin+). This is the direct
        // path; moderator-tier report-driven removal still goes through
        // moderation.service.ts's resolveReportFn.
        const perm = await getGlobalPermission(userId)
        if (!perm.authorized || !perm.canDeleteContent) {
          return err('FORBIDDEN', ownershipCheck.message)
        }
      }

      await deletePostRecord(postId)

      return ok({ postId })
    } catch (e) {
      logger.error('deletePost failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to delete post')
    }
  })

/** The current user's own posts across every status — the "My Posts" personal control page. */
export const getMyPostsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    return await queries.post.getOwnAllStatuses(context.session.userId)
  })

/** Admin post-control view — every post regardless of status (draft/published/removed/etc). */
export const getAdminPostsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }): Promise<ServerResult<Awaited<ReturnType<typeof queries.post.getAllForAdmin>>>> => {
    const perm = await getGlobalPermission(context.session.userId)
    if (!perm.authorized || !perm.canDeleteContent) {
      return err('FORBIDDEN', 'Insufficient permissions to view the post control page')
    }

    const posts = await queries.post.getAllForAdmin()
    return ok(posts)
  })

const moderateReasonInput = z.object({ postId: z.string().min(1), reason: z.string().min(1).max(1000) })

/**
 * Admin "soft delete" — sends the post back to draft with an explanation,
 * reversible: the owner can fix it and resubmit (resubmitPostFn) for the
 * admin to re-approve (approvePostFn). Distinct from adminCompleteDeletePostFn,
 * which is final.
 */
export const adminSoftDeletePostFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(moderateReasonInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: true }>> => {
    const { userId } = context.session
    const { postId, reason } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canDeleteContent) {
        return err('FORBIDDEN', 'Insufficient permissions to send this post back for revision')
      }

      const post = await queries.post.getById(postId, true)
      if (!post) return err('NOT_FOUND', 'Post not found')

      await db.update(schema.post)
        .set({ post_status: 'draft', is_published: false, moderationReason: reason, updatedAt: new Date() })
        .where(eq(schema.post.postId, postId))

      await db.insert(schema.auditLog).values({
        actorId: userId, action: 'hide_content', targetType: 'post', targetId: postId, reason,
      })

      // Best-effort, mirrors moderation.service.ts's reportContent pattern —
      // a failed notification must not fail the moderation action itself.
      try {
        await db.insert(schema.notification).values({
          userId: post.author_id, actorId: null, type: 'moderation', entityId: postId,
          message: `Your post was sent back for revision: ${reason}`,
        })
      } catch (notifyError) {
        logger.error('adminSoftDeletePost: notification failed', { postId }, notifyError instanceof Error ? notifyError : undefined)
      }

      return ok({ postId: true })
    } catch (e) {
      logger.error('adminSoftDeletePost failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to send post back for revision')
    }
  })

/** Admin "complete delete" — final, not resubmittable. Reason stays visible to the owner in their post history. */
export const adminCompleteDeletePostFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(moderateReasonInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: true }>> => {
    const { userId } = context.session
    const { postId, reason } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canDeleteContent) {
        return err('FORBIDDEN', 'Insufficient permissions to delete this post')
      }

      const post = await queries.post.getById(postId, true)
      if (!post) return err('NOT_FOUND', 'Post not found')

      await db.update(schema.post)
        .set({ post_status: 'removed', is_published: false, moderationReason: reason, updatedAt: new Date() })
        .where(eq(schema.post.postId, postId))

      await db.insert(schema.auditLog).values({
        actorId: userId, action: 'delete_post', targetType: 'post', targetId: postId, reason,
      })

      try {
        await db.insert(schema.notification).values({
          userId: post.author_id, actorId: null, type: 'moderation', entityId: null,
          message: `Your post was removed: ${reason}`,
        })
      } catch (notifyError) {
        logger.error('adminCompleteDeletePost: notification failed', { postId }, notifyError instanceof Error ? notifyError : undefined)
      }

      return ok({ postId: true })
    } catch (e) {
      logger.error('adminCompleteDeletePost failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to delete post')
    }
  })

/** Owner fixes a draft the admin sent back and resubmits it for re-approval. */
export const resubmitPostFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string().min(1), content: z.string().max(5000) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: true }>> => {
    const { userId } = context.session
    const { postId, content } = data

    try {
      const post = await queries.post.getById(postId, true)
      if (!post) return err('NOT_FOUND', 'Post not found')

      const ownershipCheck = verifyIsOwner(userId, post.author_id)
      if (!ownershipCheck.ok) return err('FORBIDDEN', ownershipCheck.message)

      if (post.post_status !== 'draft') {
        return err('BAD_REQUEST', 'Only a post sent back for revision can be resubmitted')
      }

      await db.update(schema.post)
        .set({ content, post_status: 'pending', updatedAt: new Date() })
        .where(eq(schema.post.postId, postId))

      return ok({ postId: true })
    } catch (e) {
      logger.error('resubmitPost failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to resubmit post')
    }
  })

/** Admin approves a resubmitted post, publishing it again and clearing the moderation reason. */
export const approvePostFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: true }>> => {
    const { userId } = context.session
    const { postId } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canDeleteContent) {
        return err('FORBIDDEN', 'Insufficient permissions to approve this post')
      }

      const post = await queries.post.getById(postId, true)
      if (!post) return err('NOT_FOUND', 'Post not found')

      await db.update(schema.post)
        .set({
          post_status: 'published',
          is_published: true,
          moderationReason: null,
          published_at: post.published_at ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.post.postId, postId))

      try {
        await db.insert(schema.notification).values({
          userId: post.author_id, actorId: null, type: 'moderation', entityId: postId,
          message: 'Your resubmitted post was approved and is live again.',
        })
      } catch (notifyError) {
        logger.error('approvePost: notification failed', { postId }, notifyError instanceof Error ? notifyError : undefined)
      }

      return ok({ postId: true })
    } catch (e) {
      logger.error('approvePost failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to approve post')
    }
  })

/**
 * Owner-driven visibility toggle — unpublish your own post back to a private
 * draft, or republish it, no reason/admin involved. Deliberately narrow: only
 * flips between 'draft' and 'published', never touches 'pending'/'removed',
 * which are the admin-workflow-controlled statuses (resubmitPostFn/
 * adminSoftDeletePostFn/adminCompleteDeletePostFn own those transitions).
 */
export const setOwnPostVisibilityFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string().min(1), status: z.enum(['draft', 'published']) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ status: 'draft' | 'published' }>> => {
    const { userId } = context.session
    const { postId, status } = data

    try {
      const post = await queries.post.getById(postId, true)
      if (!post) return err('NOT_FOUND', 'Post not found')

      const ownershipCheck = verifyIsOwner(userId, post.author_id)
      if (!ownershipCheck.ok) return err('FORBIDDEN', ownershipCheck.message)

      if (post.post_status !== 'draft' && post.post_status !== 'published') {
        return err('BAD_REQUEST', 'This post is under moderation review and cannot be changed right now')
      }

      await db.update(schema.post)
        .set({
          post_status: status,
          is_published: status === 'published',
          published_at: status === 'published' ? (post.published_at ?? new Date()) : post.published_at,
          updatedAt: new Date(),
        })
        .where(eq(schema.post.postId, postId))

      return ok({ status })
    } catch (e) {
      logger.error('setOwnPostVisibility failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update visibility')
    }
  })
