import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { safeDisplayName } from '@/lib/utils/format'

/** Collab invites where the current user is the invited co-author and hasn't responded yet. */
export const getPendingCollabInvitesFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    const rows = await db
      .select({
        postId: schema.postToUser.post_id,
        invitedAt: schema.postToUser.invitedAt,
        content: schema.post.content,
        authorId: schema.post.author_id,
        authorName: schema.user.name,
        authorNickname: schema.user.nickname,
      })
      .from(schema.postToUser)
      .innerJoin(schema.post, eq(schema.postToUser.post_id, schema.post.postId))
      .innerJoin(schema.user, eq(schema.post.author_id, schema.user.userId))
      .where(and(
        eq(schema.postToUser.user_id, context.session.userId),
        eq(schema.postToUser.accepted, false),
      ))

    return rows.map((r) => ({ ...r, authorName: safeDisplayName(r.authorName, r.authorNickname) }))
  })

const respondInput = z.object({ postId: z.string().min(1), accept: z.boolean() })

/** The invited user agrees to or declines a collab invite. Declining removes the invite outright — not resendable by the invitee. */
export const respondToCollabInviteFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(respondInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ accepted: boolean }>> => {
    const { userId } = context.session
    const { postId, accept } = data

    try {
      const [invite] = await db.select().from(schema.postToUser)
        .where(and(eq(schema.postToUser.post_id, postId), eq(schema.postToUser.user_id, userId)))
        .limit(1)

      if (!invite || invite.accepted) {
        return err('NOT_FOUND', 'No pending invite found')
      }

      if (accept) {
        await db.update(schema.postToUser)
          .set({ accepted: true, respondedAt: new Date() })
          .where(and(eq(schema.postToUser.post_id, postId), eq(schema.postToUser.user_id, userId)))
      } else {
        await db.delete(schema.postToUser)
          .where(and(eq(schema.postToUser.post_id, postId), eq(schema.postToUser.user_id, userId)))
      }

      const [post] = await db.select({ author_id: schema.post.author_id }).from(schema.post).where(eq(schema.post.postId, postId))
      if (post) {
        try {
          await db.insert(schema.notification).values({
            userId: post.author_id, actorId: userId, type: 'collab_invite', entityId: postId, postId,
            message: accept ? 'Accepted your collab invite.' : 'Declined your collab invite.',
          })
        } catch (notifyError) {
          logger.error('respondToCollabInvite: notification failed', { postId }, notifyError instanceof Error ? notifyError : undefined)
        }
      }

      return ok({ accepted: accept })
    } catch (e) {
      logger.error('respondToCollabInvite failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to respond to collab invite')
    }
  })
