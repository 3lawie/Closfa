import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { queries } from '@/server/queries'

export const getNotificationsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    const { userId } = context.session

    const notifications = await db.query.notification.findMany({
      where: eq(schema.notification.userId, userId),
      orderBy: (n: any, { desc }: any) => [desc(n.createdAt)],
      limit: 50,
      with: { actor: { with: { profile: { with: { avatarMedia: true } } } } }
    })

    return notifications
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
