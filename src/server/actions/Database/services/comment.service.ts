import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { getProfilePermission } from "../verifiers/permissions"
import { createCommentValidation, createReplyValidation, deleteCommentValidation, deleteReplyValidation, toggleCommentLikeValidation, toggleReplyLikeValidation } from '@/verification/comment.validation'
import { and, eq, sql } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { w } from '@/server/queries'
import { createNotification, notifyMentions } from './notification.service'

export const createComment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(createCommentValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ commentId: string }>> => {
    const { userId } = context.session
    const commentData = data

    try {
      const [newComment] = await db.insert(schema.comment)
        .values({
          userId,
          postId: commentData.postId,
          comment: commentData.comment,
          comment_type: commentData.type || 'text',
          media_id: commentData.mediaId,
        })
        .returning({ commentId: schema.comment.comment_id })

      // Neon HTTP driver has no interactive transactions — same
      // sequential-after-insert approach as like.service.ts's counter.
      await db.update(schema.post)
        .set({ comments: sql`${schema.post.comments} + 1` })
        .where(eq(schema.post.postId, commentData.postId))

      const [postRow] = await db
        .select({ authorId: schema.post.author_id })
        .from(schema.post)
        .where(eq(schema.post.postId, commentData.postId))
      if (postRow) {
        await createNotification({ recipientId: postRow.authorId, actorId: userId, type: 'comment', entityId: commentData.postId })
      }
      await notifyMentions(commentData.comment, userId, commentData.postId)

      return ok({ commentId: newComment.commentId })
    } catch (e) {
      logger.error('createComment failed', { userId, postId: commentData.postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to create comment')
    }
  })

export const createReply = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(createReplyValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ replyId: string }>> => {
    const { userId } = context.session
    const replyData = data

    try {
      const [newReply] = await db.insert(schema.commentReply)
        .values({
          user_id: userId,
          parent_comment_id: replyData.parentCommentId,
          post_id: replyData.postId,
          comment: replyData.comment,
          comment_type: replyData.type || 'text',
          media_id: replyData.mediaId,
        })
        .returning({ replyId: schema.commentReply.reply_id })

      // Two independent counters: the parent comment's own reply count
      // (drives "N replies" / the SVG thread) and the post's total comment
      // count (drives the count next to the comment icon on PostCard —
      // replies count toward it same as top-level comments).
      await db.update(schema.comment)
        .set({ comment_reply_count: sql`${schema.comment.comment_reply_count} + 1` })
        .where(eq(schema.comment.comment_id, replyData.parentCommentId))

      await db.update(schema.post)
        .set({ comments: sql`${schema.post.comments} + 1` })
        .where(eq(schema.post.postId, replyData.postId))

      const [parentComment] = await db
        .select({ userId: schema.comment.userId })
        .from(schema.comment)
        .where(eq(schema.comment.comment_id, replyData.parentCommentId))
      if (parentComment) {
        await createNotification({ recipientId: parentComment.userId, actorId: userId, type: 'reply', entityId: replyData.postId })
      }
      await notifyMentions(replyData.comment, userId, replyData.postId)

      return ok({ replyId: newReply.replyId })
    } catch (e) {
      logger.error('createReply failed', { userId, parentCommentId: replyData.parentCommentId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to create reply')
    }
  })

export const deleteComment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(deleteCommentValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ commentId: string }>> => {
    const { userId } = context.session
    const { commentId } = data

    try {
      const comment = await db.query.comment.findFirst({
        where: w({ comment_id: commentId }),
        with: { post: true },
      }) as unknown as { userId: string; postId: string; comment_reply_count: number | null; post: { author_id: string } } | undefined

      if (!comment) {
        return err('NOT_FOUND', 'Comment not found')
      }

      // 1. Verify
      const isOwner = comment.userId === userId

      // If not owner, check if they are a moderator of the post author's profile
      let isMod = false
      if (!isOwner) {
        // Find the profile of the post author
        const authorProfile = await db.query.profile.findFirst({
          where: w({ userId: comment.post.author_id }),
        })

        if (authorProfile) {
          const perm = await getProfilePermission(userId, authorProfile.profile_id)
          if (perm.authorized && perm.canDeleteComment) {
            isMod = true
          }
        }
      }

      if (!isOwner && !isMod) {
        return err('FORBIDDEN', 'Insufficient permissions to delete this comment')
      }

      // 2. Execute — replies have no ON DELETE CASCADE to the parent
      // comment (same reasoning as moderation.service.ts's report-resolve
      // path), so they're deleted first or the FK blocks this delete
      // outright whenever the comment has replies.
      const removedReplyCount = comment.comment_reply_count ?? 0
      await db.delete(schema.commentReply).where(eq(schema.commentReply.parent_comment_id, commentId))
      await db.delete(schema.comment).where(eq(schema.comment.comment_id, commentId))

      await db.update(schema.post)
        .set({ comments: sql`GREATEST(${schema.post.comments} - ${1 + removedReplyCount}, 0)` })
        .where(eq(schema.post.postId, comment.postId))

      // 3. Audit (if mod deleted it)
      if (isMod && !isOwner) {
        await db.insert(schema.auditLog).values({
          actorId: userId,
          action: 'delete_comment',
          targetType: 'comment',
          targetId: commentId,
        })
      }

      return ok({ commentId })
    } catch (e) {
      logger.error('deleteComment failed', { userId, commentId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to delete comment')
    }
  })

export const deleteReply = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(deleteReplyValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ replyId: string }>> => {
    const { userId } = context.session
    const { replyId } = data

    try {
      const reply = await db.query.commentReply.findFirst({
        where: w({ reply_id: replyId }),
        with: { post: true },
      }) as unknown as { user_id: string; post_id: string; parent_comment_id: string; post: { author_id: string } } | undefined

      if (!reply) {
        return err('NOT_FOUND', 'Reply not found')
      }

      const isOwner = reply.user_id === userId

      let isMod = false
      if (!isOwner) {
        const authorProfile = await db.query.profile.findFirst({
          where: w({ userId: reply.post.author_id }),
        })

        if (authorProfile) {
          const perm = await getProfilePermission(userId, authorProfile.profile_id)
          if (perm.authorized && perm.canDeleteComment) {
            isMod = true
          }
        }
      }

      if (!isOwner && !isMod) {
        return err('FORBIDDEN', 'Insufficient permissions to delete this reply')
      }

      await db.delete(schema.commentReply).where(eq(schema.commentReply.reply_id, replyId))

      await db.update(schema.comment)
        .set({ comment_reply_count: sql`GREATEST(${schema.comment.comment_reply_count} - 1, 0)` })
        .where(eq(schema.comment.comment_id, reply.parent_comment_id))

      await db.update(schema.post)
        .set({ comments: sql`GREATEST(${schema.post.comments} - 1, 0)` })
        .where(eq(schema.post.postId, reply.post_id))

      if (isMod && !isOwner) {
        await db.insert(schema.auditLog).values({
          actorId: userId,
          action: 'delete_comment',
          targetType: 'comment',
          targetId: replyId,
        })
      }

      return ok({ replyId })
    } catch (e) {
      logger.error('deleteReply failed', { userId, replyId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to delete reply')
    }
  })

/**
 * Toggle the current user's like on a comment and keep the denormalized
 * comment.comment_likes counter in sync — same delete-then-insert +
 * GREATEST(...,0)-floored SQL pattern as like.service.ts's toggleLike.
 */
export const toggleCommentLike = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(toggleCommentLikeValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ liked: boolean; likes: number }>> => {
    const { userId } = context.session
    const { commentId } = data

    try {
      const removed = await db
        .delete(schema.commentLike)
        .where(and(eq(schema.commentLike.commentId, commentId), eq(schema.commentLike.userId, userId)))
        .returning({ id: schema.commentLike.id })

      if (removed.length > 0) {
        const [row] = await db
          .update(schema.comment)
          .set({ comment_likes: sql`GREATEST(${schema.comment.comment_likes} - 1, 0)` })
          .where(eq(schema.comment.comment_id, commentId))
          .returning({ comment_likes: schema.comment.comment_likes })
        return ok({ liked: false, likes: row?.comment_likes ?? 0 })
      }

      const added = await db
        .insert(schema.commentLike)
        .values({ commentId, userId })
        .onConflictDoNothing()
        .returning({ id: schema.commentLike.id })

      if (added.length > 0) {
        const [row] = await db
          .update(schema.comment)
          .set({ comment_likes: sql`${schema.comment.comment_likes} + 1` })
          .where(eq(schema.comment.comment_id, commentId))
          .returning({ comment_likes: schema.comment.comment_likes })
        return ok({ liked: true, likes: row?.comment_likes ?? 0 })
      }

      // Rare race: a concurrent request re-liked between our delete and insert.
      const current = await db
        .select({ comment_likes: schema.comment.comment_likes })
        .from(schema.comment)
        .where(eq(schema.comment.comment_id, commentId))
      return ok({ liked: true, likes: current[0]?.comment_likes ?? 0 })
    } catch (e) {
      logger.error('toggleCommentLike failed', { userId, commentId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update comment like')
    }
  })

/** Same as toggleCommentLike, one level down — a like on a reply. */
export const toggleReplyLike = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(toggleReplyLikeValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ liked: boolean; likes: number }>> => {
    const { userId } = context.session
    const { replyId } = data

    try {
      const removed = await db
        .delete(schema.commentReplyLike)
        .where(and(eq(schema.commentReplyLike.replyId, replyId), eq(schema.commentReplyLike.userId, userId)))
        .returning({ id: schema.commentReplyLike.id })

      if (removed.length > 0) {
        const [row] = await db
          .update(schema.commentReply)
          .set({ comment_likes: sql`GREATEST(${schema.commentReply.comment_likes} - 1, 0)` })
          .where(eq(schema.commentReply.reply_id, replyId))
          .returning({ comment_likes: schema.commentReply.comment_likes })
        return ok({ liked: false, likes: row?.comment_likes ?? 0 })
      }

      const added = await db
        .insert(schema.commentReplyLike)
        .values({ replyId, userId })
        .onConflictDoNothing()
        .returning({ id: schema.commentReplyLike.id })

      if (added.length > 0) {
        const [row] = await db
          .update(schema.commentReply)
          .set({ comment_likes: sql`${schema.commentReply.comment_likes} + 1` })
          .where(eq(schema.commentReply.reply_id, replyId))
          .returning({ comment_likes: schema.commentReply.comment_likes })
        return ok({ liked: true, likes: row?.comment_likes ?? 0 })
      }

      const current = await db
        .select({ comment_likes: schema.commentReply.comment_likes })
        .from(schema.commentReply)
        .where(eq(schema.commentReply.reply_id, replyId))
      return ok({ liked: true, likes: current[0]?.comment_likes ?? 0 })
    } catch (e) {
      logger.error('toggleReplyLike failed', { userId, replyId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update reply like')
    }
  })
