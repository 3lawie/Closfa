import { z } from 'zod'

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'] as const
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const
export const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'] as const
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES] as const

export const mediaSchema = z.object({
  mediaUrl: z.string().min(1, 'Media URL is required'),
  fileName: z.string().min(1, 'File name is required').max(255),
  mimeType: z.enum(ALLOWED_MEDIA_TYPES, { error: 'Unsupported media type' }),
  fileSize: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
})

export type MediaInput = z.infer<typeof mediaSchema>

/** Compute the resolution label from pixel dimensions */
export function computeResolution(width: number, height: number): 'SD' | 'HD' | 'FHD' | 'QHD' | 'UHD' {
  const shorter = Math.min(width, height)
  if (shorter >= 2160) return 'UHD'
  if (shorter >= 1440) return 'QHD'
  if (shorter >= 1080) return 'FHD'
  if (shorter >= 720) return 'HD'
  return 'SD'
}
