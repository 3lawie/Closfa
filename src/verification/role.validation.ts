import { z } from 'zod'

export const generateRoleKeyValidation = z.object({
  role: z.enum(['admin', 'senior_moderator', 'moderator']),
})

export const redeemRoleKeyValidation = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .max(64, 'Code must be at most 64 characters'),
})

export const revokeGlobalRoleValidation = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
})

export const assignGlobalModeratorValidation = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
  level: z.enum(['moderator', 'senior_moderator']),
})

export const searchUsersByNicknameValidation = z.object({
  query: z
    .string()
    .min(1, 'Search query is required')
    .max(30, 'Search query must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Nickname can only contain letters, numbers, and underscores'),
})

export type GenerateRoleKeyInput = z.infer<typeof generateRoleKeyValidation>
export type RedeemRoleKeyInput = z.infer<typeof redeemRoleKeyValidation>
export type RevokeGlobalRoleInput = z.infer<typeof revokeGlobalRoleValidation>
export type AssignGlobalModeratorInput = z.infer<typeof assignGlobalModeratorValidation>
export type SearchUsersByNicknameInput = z.infer<typeof searchUsersByNicknameValidation>
