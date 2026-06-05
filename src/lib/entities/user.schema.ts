import { z } from 'zod'

export const userSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  nickname: z.string().min(3, 'Nickname must be at least 3 characters').max(30),
  bio: z.string().max(160, 'Bio must be 160 characters or less').optional().nullable(),
  website: z.string().url('Must be a valid URL').optional().nullable(),
  location: z.string().max(50).optional().nullable(),
})

export type UserInput = z.infer<typeof userSchema>
