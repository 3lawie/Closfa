import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/server/auth/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { getProfilePermission } from "../verifiers/permissions"
import { eq } from 'drizzle-orm'

export const createComment = createServerFn({ method: 'POST' })

  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const commentData = data as any

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

    return { success: true, commentId: newComment.commentId }
  })

export const deleteComment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { commentId } = data as { commentId: string }

    const comment = await db.query.comment.findFirst({
      where: eq(schema.comment.comment_id, commentId),
      with: { post: true },
    })

    if (!comment) throw new Error('Comment not found')

    // 1. Verify
    const isOwner = comment.userId === userId

    // If not owner, check if they are a moderator of the post author's profile
    let isMod = false
    if (!isOwner) {
      // Find the profile of the post author
      const authorProfile = await db.query.profile.findFirst({
        where: eq(schema.profile.userId, comment.post.author_id),
      })

      if (authorProfile) {
        const perm = await getProfilePermission(userId, authorProfile.profile_id)
        if (perm.authorized && perm.canDeleteComment) {
          isMod = true
        }
      }
    }

    if (!isOwner && !isMod) {
      throw new Error('Insufficient permissions to delete this comment')
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

    return { success: true }
  })
