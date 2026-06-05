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
// ──────────────────────────────────────────────────────────────

import { createServerFn } from '@tanstack/react-start'
import crypto from 'crypto'
import { verifyImageKitUpload, type FileMetadata } from "../verifiers/imagekit.verify"

type AuthResult = {
  token: string
  expire: number
  signature: string
}

/**
 * Generate an ImageKit upload authentication signature.
 * Optionally accepts file metadata for pre-validation.
 */
export const getImageKitAuth = createServerFn({ method: 'GET' })
  .handler(async (): Promise<AuthResult> => {
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

/**
 * Validate a file before generating auth — use this for stricter uploads.
 * Pass file metadata from the client; server validates type/size before signing.
 */
export const getImageKitAuthValidated = createServerFn({ method: 'POST' })
  .handler(async ({ data }): Promise<AuthResult> => {
    const file = data as unknown as FileMetadata

    const check = verifyImageKitUpload(file)
    if (!check.ok) {
      throw new Error(check.message)
    }

    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY!
    const token = crypto.randomUUID()
    const expire = Math.floor(Date.now() / 1000) + 2400

    const signature = crypto
      .createHmac('sha1', privateKey)
      .update(token + expire)
      .digest('hex')

    return { token, expire, signature }
  })
