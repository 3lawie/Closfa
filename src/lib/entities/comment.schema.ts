import { z } from 'zod'

export const commentSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  comment: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment is too long'),
  type: z.enum(['text', 'sticker']).optional(),
  mediaId: z.string().optional(),
})

export type CommentInput = z.infer<typeof commentSchema>
