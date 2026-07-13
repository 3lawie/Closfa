import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'

const keywordInput = z.object({ keyword: z.string().trim().min(1).max(100) })

export const getMutedKeywordsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    return await db
      .select({ id: schema.mutedKeyword.id, keyword: schema.mutedKeyword.keyword })
      .from(schema.mutedKeyword)
      .where(eq(schema.mutedKeyword.userId, context.session.userId))
  })

export const addMutedKeywordFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(keywordInput)
  .handler(async ({ data, context }): Promise<ServerResult<{ added: true }>> => {
    const { userId } = context.session

    try {
      await db.insert(schema.mutedKeyword)
        .values({ userId, keyword: data.keyword.toLowerCase() })
        .onConflictDoNothing()

      return ok({ added: true })
    } catch (e) {
      logger.error('addMutedKeyword failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to add muted keyword')
    }
  })

export const removeMutedKeywordFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ removed: true }>> => {
    const { userId } = context.session

    try {
      await db.delete(schema.mutedKeyword)
        .where(and(eq(schema.mutedKeyword.id, data.id), eq(schema.mutedKeyword.userId, userId)))

      return ok({ removed: true })
    } catch (e) {
      logger.error('removeMutedKeyword failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to remove muted keyword')
    }
  })
