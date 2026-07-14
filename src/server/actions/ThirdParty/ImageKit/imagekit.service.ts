// ──────────────────────────────────────────────────────────────
// ImageKit Server Function — HMAC signature for client uploads
//
// Replaces the old Next.js /api/imagekit-auth API route.
// Uses createServerFn so IMAGEKIT_PRIVATE_KEY never reaches the browser.
//
// How ImageKit auth works:
//   1. Client calls this server function to get { token, signature, expire }
//   2. Client passes those + publicKey to ImageKit's upload() SDK
//   3. ImageKit validates: signature = HMAC-SHA1(token + expire, privateKey)
//   4. If valid, ImageKit accepts the upload
//
// The signature is a one-time, time-limited proof that our server
// authorized this upload. It expires in 40 minutes.
//
// SECURITY (security#2): signing is gated behind authMiddleware +
// rateLimiterMiddleWare and requires validated file metadata. There is NO
// unauthenticated variant — an anonymous caller must never obtain a 40-minute
// upload token. Input is Zod-validated (no `as any`) and re-checked against
// the type/size allow-list before a signature is issued.
// ──────────────────────────────────────────────────────────────

import { createServerFn } from '@tanstack/react-start'
import crypto from 'crypto'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { verifyImageKitUpload } from './imagekit.verify'

type AuthResult = {
  token: string
  expire: number
  signature: string
}

/** File metadata the client must present before we sign an upload. */
const fileMetadataInput = z.object({
  mimeType: z.string(),
  fileSizeBytes: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
})
type FileMetadataInput = z.infer<typeof fileMetadataInput>

/** The token/signature themselves carry no file-specific data — ImageKit's
 *  scheme only binds them to an expiry window, not to a particular file —
 *  so this is safe to call once per file inside a batch (see
 *  {@link getImageKitAuthBatch}) as well as for the single-file case below. */
function issueAuth(privateKey: string): AuthResult {
  const token = crypto.randomUUID()
  const expire = Math.floor(Date.now() / 1000) + 2400 // 40 minutes
  const signature = crypto
    .createHmac('sha1', privateKey)
    .update(token + expire)
    .digest('hex')
  return { token, expire, signature }
}

/**
 * Generate an ImageKit upload authentication signature.
 *
 * Requires an authenticated, rate-limited caller and validated file metadata.
 * The signature is only issued after the file passes the type/size allow-list
 * in {@link verifyImageKitUpload}.
 */
export const getImageKitAuth = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(fileMetadataInput)
  .handler(async ({ data }: { data: FileMetadataInput }): Promise<AuthResult> => {
    const check = verifyImageKitUpload(data)
    if (!check.ok) {
      throw new Error(check.message)
    }

    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
    if (!privateKey) {
      throw new Error('IMAGEKIT_PRIVATE_KEY is not set')
    }

    return issueAuth(privateKey)
  })

/** Same as {@link getImageKitAuth}, but for every file in a post at once —
 *  publishing N attachments previously cost N round trips to this server
 *  just for auth tokens before any actual upload could start. Capped at 24
 *  (12 media files + up to 12 paired video-thumbnail uploads, the same limit
 *  `MediaContatiner.tsx` already enforces client-side). */
const batchInput = z.object({
  files: z.array(fileMetadataInput).min(1).max(24),
})

export const getImageKitAuthBatch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(batchInput)
  .handler(async ({ data }): Promise<AuthResult[]> => {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
    if (!privateKey) {
      throw new Error('IMAGEKIT_PRIVATE_KEY is not set')
    }

    // Same all-or-nothing behavior as calling getImageKitAuth per file used
    // to have: one bad file throws and aborts the whole batch, just from a
    // single round trip instead of N.
    return data.files.map((file) => {
      const check = verifyImageKitUpload(file)
      if (!check.ok) {
        throw new Error(`${file.fileName}: ${check.message}`)
      }
      return issueAuth(privateKey)
    })
  })
