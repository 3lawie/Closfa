import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, optionalAuthMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { queries } from '@/server/queries'
import { verifyIsOwner } from '../verifiers/auth'
import { eq } from 'drizzle-orm'

/** Fetch a single post for the detail route. Public (guests and users). */
const getPostInput = z.object({ postId: z.string().min(1) })
export const getPostFn = createServerFn({ method: 'GET' })
  .middleware([optionalAuthMiddleware, rateLimiterMiddleWare])
  .inputValidator(getPostInput)
  .handler(async ({ data }) => {
    const post = await queries.post.getById(data.postId)
    return post ?? null
  })

const legacyCreatePostInput = z.object({
  content: z.string().max(5000).optional(),
  category: z.string().min(1),
  status: z.enum(['draft', 'published']).optional(),
  mediaIds: z.array(z.string().min(1)).max(10).optional(),
})

export const createPost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(legacyCreatePostInput)
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const postData = data

    // 2. Execute
    const [newPost] = await db.insert(schema.post)
      .values({
        content: postData.content,
        author_id: userId,
        post_category: postData.category,
        post_status: postData.status || 'published',
        is_published: postData.status === 'published',
        published_at: postData.status === 'published' ? new Date() : null,
      })
      .returning({ postId: schema.post.postId })

    // Link media if any
    if (postData.mediaIds && postData.mediaIds.length > 0) {
      await db.insert(schema.postToMedia).values(
        postData.mediaIds.map((mediaId: string) => ({
          post_id: newPost.postId,
          media_id: mediaId,
        }))
      )
    }

    return { success: true, postId: newPost.postId }
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
type CreatePostInput = z.infer<typeof createPostInput>

/**
 * Create a post with optional media. The client uploads each file to ImageKit
 * first, then sends the resulting URLs + metadata here. Media rows are
 * normalized so they satisfy the media table's type/dimension CHECK constraints.
 */
export const createPostWithMedia = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(createPostInput)
  .handler(async ({ data, context }) => {
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

      return { ok: true, data: { postId: postRow.postId } }
    } catch (err) {
      console.error('[createPostWithMedia] Failed:', err)
      return { ok: false, error: 'INTERNAL_ERROR', message: 'Failed to create post' }
    }
  })

export const deletePost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ postId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { postId } = data

    // 1. Verify
    const post = await db.query.post.findFirst({
      where: { postId } as any,
    })

    if (!post) {
      throw new Error('Post not found')
    }

    const ownershipCheck = verifyIsOwner(userId, post.author_id)
    if (!ownershipCheck.ok) {
      // Allow if they are a moderator (handled in moderation.service)
      // Here we only allow the owner
      throw new Error(ownershipCheck.message)
    }

    // 2. Execute
    await db.delete(schema.post).where(eq(schema.post.postId, postId))

    return { success: true }
  })
