import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { getProfilePermission } from "../verifiers/permissions"
import { createCommentValidation, deleteCommentValidation } from '@/verification/comment.validation'
import { eq } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'

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

      // Update comment count on post
      // Note: Neon HTTP driver doesn't support interactive transactions
      // So we do it sequentially, or use a trigger/view ideally.

      return ok({ commentId: newComment.commentId })
    } catch (e) {
      logger.error('createComment failed', { userId, postId: commentData.postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to create comment')
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
        where: { comment_id: commentId } as any,
        with: { post: true },
      })

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
          where: { userId: (comment.post as any)!.author_id } as any,
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

      // 2. Execute
      await db.delete(schema.comment).where(eq(schema.comment.comment_id, commentId))

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
