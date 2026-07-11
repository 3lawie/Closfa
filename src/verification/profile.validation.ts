import { z } from 'zod'

/** Profile update validation */
export const updateProfileValidation = z.object({
  bio: z.string().max(160).optional(),
  website: z.url().max(255).optional(),
  location: z.string().max(255).optional(),
}).extend({
  imageMediaId: z.string().optional(), // ID of the uploaded media record
})

/** Display name update — name + nickname separately */
export const updateDisplayNameValidation = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  nickname: z
    .string()
    .min(3, 'Nickname must be at least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Nickname can only contain letters, numbers, and underscores'),
})

/**
 * Onboarding nickname claim — same nickname rules as display-name updates.
 * turnstileToken is optional at the schema level: in dev without Turnstile
 * keys the widget never produces one; the server verifier fails closed in
 * production when it's absent.
 */
export const claimNicknameValidation = updateDisplayNameValidation
  .pick({ nickname: true })
  .extend({ turnstileToken: z.string().optional() })

export type UpdateProfileInput = z.infer<typeof updateProfileValidation>
export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameValidation>
export type ClaimNicknameInput = z.infer<typeof claimNicknameValidation>
