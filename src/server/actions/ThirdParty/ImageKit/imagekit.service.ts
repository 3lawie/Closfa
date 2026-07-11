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

    const token = crypto.randomUUID()
    const expire = Math.floor(Date.now() / 1000) + 2400 // 40 minutes

    const signature = crypto
      .createHmac('sha1', privateKey)
      .update(token + expire)
      .digest('hex')

    return { token, expire, signature }
  })
