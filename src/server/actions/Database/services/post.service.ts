import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { verifyIsOwner } from '../verifiers/auth'
import { eq } from 'drizzle-orm'

export const createPost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const postData = data as any

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

export const deletePost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context.session
    const { postId } = data as unknown as { postId: string }

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
