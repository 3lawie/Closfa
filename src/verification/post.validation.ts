import { z } from 'zod'
import { postSchema } from '@/lib/entities/post.schema'

/** Full post creation validation — used in the create post form */
export const createPostValidation = postSchema.extend({
  status: z.enum(['draft', 'published']).default('draft'),
  mediaIds: z.array(z.string().min(1)).max(10, 'Maximum 10 media items per post').optional(),
})

/** Post update validation — all fields optional except postId */
export const updatePostValidation = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  content: z.string().min(1).max(2000).optional(),
  category: z.string().min(1).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  mediaIds: z.array(z.string()).optional(),
})

export type CreatePostInput = z.infer<typeof createPostValidation>
export type UpdatePostInput = z.infer<typeof updatePostValidation>
