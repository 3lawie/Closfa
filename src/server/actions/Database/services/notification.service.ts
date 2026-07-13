import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { queries, w } from '@/server/queries'
import { updateNotificationPreferenceValidation } from '@/verification/notification.validation'

type EventNotificationType = 'like' | 'comment' | 'reply' | 'follow' | 'mention'

const NOTIFICATION_MESSAGE: Record<EventNotificationType, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  follow: 'started following you',
  mention: 'mentioned you',
}

async function isNotificationTypeEnabled(userId: string, type: EventNotificationType): Promise<boolean> {
  const pref = await db.query.notificationPreference.findFirst({
    where: w({ userId, type }),
  })
  // Absence of a row means "enabled" — the table only stores opt-outs.
  return (pref as unknown as { enabled: boolean } | undefined)?.enabled ?? true
}

/**
 * Central writer for all event-driven notification types. Never throws — a
 * failed notification must not fail the like/comment/follow action that
 * triggered it. Skips self-notifications and respects per-type opt-outs.
 */
export async function createNotification(params: {
  recipientId: string
  actorId: string
  type: EventNotificationType
  entityId: string | null
}): Promise<void> {
  const { recipientId, actorId, type, entityId } = params
  if (recipientId === actorId) return

  try {
    if (!(await isNotificationTypeEnabled(recipientId, type))) return

    if (type === 'like' && entityId) {
      // Coalesce repeat likes on the same post into one row instead of one
      // notification per like — the whole point of this app's "aware
      // intention" premise is not recreating the infinite-ping problem it
      // exists to avoid.
      const existing = await db.query.notification.findFirst({
        where: w({ userId: recipientId, type: 'like', entityId, read: false }),
      }) as unknown as { id: string; message: string | null } | undefined

      if (existing) {
        const othersMatch = existing.message?.match(/and (\d+) other/)
        const othersCount = othersMatch ? parseInt(othersMatch[1], 10) + 1 : 1
        await db.update(schema.notification)
          .set({
            actorId,
            message: `and ${othersCount} other${othersCount === 1 ? '' : 's'} liked your post`,
            createdAt: new Date(),
          })
          .where(eq(schema.notification.id, existing.id))
        return
      }
    }

    await db.insert(schema.notification).values({
      userId: recipientId,
      actorId,
      type,
      entityId,
      message: NOTIFICATION_MESSAGE[type],
    })
  } catch (e) {
    logger.error('createNotification failed', { recipientId, actorId, type }, e instanceof Error ? e : undefined)
  }
}

const MENTION_REGEX = /@([a-zA-Z0-9_]{1,30})/g

/**
 * Extracts @nicknames from post/comment content and notifies each resolved
 * user once. Silent no-op on unknown nicknames — mentions are best-effort,
 * not a validated input surface.
 */
export async function notifyMentions(content: string, actorId: string, entityId: string): Promise<void> {
  const nicknames = [...new Set([...content.matchAll(MENTION_REGEX)].map((m) => m[1]))]
  if (nicknames.length === 0) return

  try {
    const mentioned = await db
      .select({ userId: schema.user.userId, nickname: schema.user.nickname })
      .from(schema.user)
      .where(inArray(schema.user.nickname, nicknames))

    await Promise.all(
      mentioned.map((u) => createNotification({ recipientId: u.userId, actorId, type: 'mention', entityId })),
    )
  } catch (e) {
    logger.error('notifyMentions failed', { actorId, entityId }, e instanceof Error ? e : undefined)
  }
}

export const getNotificationPreferencesFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    const { userId } = context.session
    return await db.query.notificationPreference.findMany({ where: w({ userId }) }) as unknown as Array<{
      type: EventNotificationType | 'system' | 'moderation'
      enabled: boolean
    }>
  })

export const updateNotificationPreferenceFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(updateNotificationPreferenceValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ success: true }>> => {
    const { userId } = context.session

    try {
      await db.insert(schema.notificationPreference)
        .values({ userId, type: data.type, enabled: data.enabled })
        .onConflictDoUpdate({
          target: [schema.notificationPreference.userId, schema.notificationPreference.type],
          set: { enabled: data.enabled },
        })

      return ok({ success: true })
    } catch (e) {
      logger.error('updateNotificationPreference failed', { userId, type: data.type }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update notification preference')
    }
  })

export const getNotificationsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    const { userId } = context.session
    return await queries.notification.getForUser(userId)
  })

/** Lightweight badge check — avoids loading the full notification list just to know whether the dot should show. */
export const getUnreadNotificationCountFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    const { userId } = context.session
    const unread = await queries.notification.getUnread(userId)
    return unread.length
  })

export const markAsReadFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ notificationId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ success: true }>> => {
    const { userId } = context.session
    const { notificationId } = data

    try {
      await db.update(schema.notification)
        .set({ read: true })
        .where(and(eq(schema.notification.id, notificationId), eq(schema.notification.userId, userId)))

      return ok({ success: true })
    } catch (e) {
      logger.error('markAsRead failed', { userId, notificationId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to mark notification as read')
    }
  })

export const markAllAsReadFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }): Promise<ServerResult<{ success: true }>> => {
    const { userId } = context.session

    try {
      await db.update(schema.notification)
        .set({ read: true })
        .where(eq(schema.notification.userId, userId))

      return ok({ success: true })
    } catch (e) {
      logger.error('markAllAsRead failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to mark all notifications as read')
    }
  })
