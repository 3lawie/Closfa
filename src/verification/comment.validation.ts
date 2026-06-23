import { z } from 'zod'

/** Comment creation validation */
export const createCommentValidation = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  comment: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment is too long'),
  type: z.enum(['text', 'sticker']).optional(),
  mediaId: z.string().optional(),
})

/** Comment reply validation */
export const createReplyValidation = z.object({
  parentCommentId: z.string().min(1, 'Parent comment ID is required'),
  postId: z.string().min(1, 'Post ID is required'),
  comment: z.string().min(1, 'Reply cannot be empty').max(1000, 'Reply is too long'),
  type: z.enum(['text', 'sticker']).optional(),
  mediaId: z.string().optional(),
})

/** Delete validation */
export const deleteCommentValidation = z.object({
  commentId: z.string().min(1, 'Comment ID is required'),
})

export type CreateCommentInput = z.infer<typeof createCommentValidation>
export type CreateReplyInput = z.infer<typeof createReplyValidation>
export type DeleteCommentInput = z.infer<typeof deleteCommentValidation>
