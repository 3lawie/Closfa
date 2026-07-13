import { z } from 'zod'

/** Per-type notification opt-out — 'system'/'moderation' are not user-toggleable. */
export const updateNotificationPreferenceValidation = z.object({
  type: z.enum(['like', 'comment', 'reply', 'follow', 'mention']),
  enabled: z.boolean(),
})

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceValidation>
