// ──────────────────────────────────────────────────────────────
// ImageKit Server Function — replaces /api/imagekit-auth route
//
// Generates the secure signature needed for client-side uploads.
// Uses createServerFn so the IMAGEKIT_PRIVATE_KEY never leaves the server.
// ──────────────────────────────────────────────────────────────

import { createServerFn } from '@tanstack/react-start'
import crypto from 'crypto'

export const getImageKitAuth = createServerFn({ method: 'GET' })
  .handler(async () => {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY!
    const token = crypto.randomUUID()
    const expire = Math.floor(Date.now() / 1000) + 2400 // 40 min

    const signature = crypto
      .createHmac('sha1', privateKey)
      .update(token + expire)
      .digest('hex')

    return { token, expire, signature }
  })
