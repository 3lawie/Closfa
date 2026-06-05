import { z } from 'zod'

export const postSchema = z.object({
  content: z.string().min(1, 'Post cannot be empty').max(2000, 'Post is too long'),
  category: z.string().min(1, 'Category is required'),
  status: z.enum(['draft', 'published']).optional(),
  mediaIds: z.array(z.string()).optional(),
})

export type PostInput = z.infer<typeof postSchema>
