import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, optionalAuthMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { queries } from '@/server/queries'
import { verifyIsOwner } from '../verifiers/auth'
import { eq } from 'drizzle-orm'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'

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
          duration: z.number().int().positive().optional(),
        }),
      )
      .max(10)
      .default([]),
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
    const { content, media } = data

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
          is_published: true,
          published_at: new Date(),
        })
        .returning({ postId: schema.post.postId })

      if (mediaIds.length > 0) {
        await db.insert(schema.postToMedia).values(
          mediaIds.map((media_id) => ({ post_id: postRow.postId, media_id })),
        )
      }

      return ok({ postId: postRow.postId })
    } catch (e) {
      logger.error('createPostWithMedia failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to create post')
    }
  })

export const deletePost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ postId: string }>> => {
    const { userId } = context.session
    const { postId } = data

    try {
      const post = await queries.post.getById(postId)

      if (!post) {
        return err('NOT_FOUND', 'Post not found')
      }

      const ownershipCheck = verifyIsOwner(userId, post.author_id)
      if (!ownershipCheck.ok) {
        // Only the owner may delete here; moderator removal lives in moderation.service.
        return err('FORBIDDEN', ownershipCheck.message)
      }

      // First delete all child records to satisfy foreign key constraints
      await db.delete(schema.commentReply).where(eq(schema.commentReply.post_id, postId))
      await db.delete(schema.comment).where(eq(schema.comment.postId, postId))
      await db.delete(schema.postLike).where(eq(schema.postLike.postId, postId))
      await db.delete(schema.postToCategory).where(eq(schema.postToCategory.post_id, postId))
      await db.delete(schema.postToUser).where(eq(schema.postToUser.post_id, postId))
      await db.delete(schema.postToMedia).where(eq(schema.postToMedia.post_id, postId))

      // Now delete the post itself
      await db.delete(schema.post).where(eq(schema.post.postId, postId))

      // Delete media records and ImageKit files
      if (post.media && post.media.length > 0) {
        const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
        if (privateKey) {
          const ikAuth = Buffer.from(`${privateKey}:`).toString('base64')
          for (const m of post.media) {
            // Delete from our database
            await db.delete(schema.media).where(eq(schema.media.media_id, m.media_id))
            
            // Try to delete from ImageKit
            try {
              const searchUrl = `https://api.imagekit.io/v1/files?searchQuery=name="${m.fileName}"`
              const searchRes = await fetch(searchUrl, { headers: { Authorization: `Basic ${ikAuth}` } })
              if (searchRes.ok) {
                const data = await searchRes.json()
                for (const file of data) {
                  await fetch(`https://api.imagekit.io/v1/files/${file.fileId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Basic ${ikAuth}` }
                  })
                }
              }
            } catch (err) {
              logger.warn(`Failed to delete media from ImageKit: ${m.fileName}`, { postId }, err instanceof Error ? err : undefined)
            }
          }
        }
      }

      return ok({ postId })
    } catch (e) {
      logger.error('deletePost failed', { userId, postId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to delete post')
    }
  })
