// ──────────────────────────────────────────────────────────────
// Session Management — HttpOnly encrypted cookie sessions
//
// WHY encrypted cookies instead of a session store (Redis/DB)?
//   • No extra infrastructure — works purely at the edge
//   • Stateless — no DB lookup on every request
//   • HttpOnly + SameSite=Lax prevents XSS token theft
//   • Encrypted with AES-256-GCM — payload is unreadable to client
//
// ── Approach Comparison ────────────────────────────────────────
//
//  [CURRENT — ACTIVE] jose JWE (JSON Web Encryption)
//  ─────────────────────────────────────────────────
//  • jose is a standards-compliant library for JWT/JWE/JWS
//  • Uses Web Crypto API internally → works in Cloudflare Workers,
//    Deno, Node.js 18+, and all modern runtimes natively
//  • EncryptJWT produces a JWE compact token (5 Base64URL parts)
//    format: header.key.iv.ciphertext.tag
//  • Algorithm: PBES2-HS256+A128KW (password-based key derivation)
//    + A256GCM (AES-256-GCM for content encryption)
//  • Session data is embedded IN the token — no server-side store needed
//  • Best choice for: Cloudflare Workers, edge deployments, serverless
//  • Install: npm install jose
//
//  [ALTERNATIVE] vinxi/http useSession
//  ─────────────────────────────────────
//  • Built into the old Vinxi bundler's HTTP utilities
//  • Simpler API: useSession({ password }) then session.update()/clear()
//  • Uses h3's setCookie() / getCookie() under the hood
//  • Automatically handles HttpOnly, Secure, SameSite flags
//  • BUT: Vinxi is removed from TanStack Start (now Vite-native)
//    so this approach is no longer available in our stack
//  • Example (for reference only, DO NOT use without vinxi):
//
//    import { useSession } from 'vinxi/http'
//    const session = await useSession<SessionData>({ password: process.env.SESSION_SECRET! })
//    await session.update({ userId, email })  // creates cookie
//    await session.clear()                    // destroys cookie
//
//  [ALTERNATIVE] @tanstack/react-start useSession (future)
//  ─────────────────────────────────────────────────────────
//  • TanStack Start plans to add a built-in useSession helper
//    similar to vinxi's but framework-agnostic
//  • As of TanStack Start 1.x, this does NOT yet exist
//  • When added, it would be: import { useSession } from '@tanstack/react-start/server'
//  • Until then, jose is the recommended production-ready approach
//
// ──────────────────────────────────────────────────────────────

import { EncryptJWT, jwtDecrypt } from 'jose'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/** What we store inside the session cookie */
export const SessionData = z.object({
  userId: z.string("userId is required"),
  sub: z.string("sub is required (Auth Id)"),      // Auth0 subject identifier (auth_provider_id)
  email: z.string().email("email form is required"),
  name: z.string("name is required"),
  nickname: z.string().nullable(),
  issuedAt: z.number(), // Unix timestamp
  expiresAt: z.number(), // Unix timestamp
})
export type SessionData = z.infer<typeof SessionData>


export const SessionResult = z.object({
  session: SessionData.nullable(),
  status: z.enum(["valid", 'renewed', 'expired', 'unauthorized'], "session status is required")
})

export type SessionResult = z.infer<typeof SessionResult>
// ──────────────────────────────────────────────────────────────
// Cookie + crypto settings
// ──────────────────────────────────────────────────────────────
const COOKIE_NAME = 'closfa_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7 // 7 days

/**
 * Derive a 32-byte key from SESSION_SECRET using TextEncoder.
 * jose's PBES2 also hashes the secret internally, so this
 * just needs to be a stable byte sequence of reasonable length.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is not set')
  // Pad/truncate to 32 bytes for AES-256 consistency
  const encoder = new TextEncoder()
  const bytes = encoder.encode(secret)
  const key = new Uint8Array(32)
  key.set(bytes.slice(0, 32))
  return key
}

// ──────────────────────────────────────────────────────────────
// Core session operations
// ──────────────────────────────────────────────────────────────

/**
 * Read and decrypt the session from the request cookie.
 * Returns null if cookie is absent or token is invalid/expired.
 */
export const getSession = createServerFn({ method: "GET" })
  .handler(async (): Promise<SessionResult> => {
    try {
      const request = getRequest()
      if (!request) return { session: null, status: 'unauthorized' }

      const cookieHeader = request.headers.get('cookie')
      if (!cookieHeader) return { session: null, status: 'unauthorized' }

      // Parse cookies manually — no cookie-parser dependency needed
      const cookies = Object.fromEntries(
        cookieHeader.split(';').map((c: string) => {
          const [k, ...v] = c.trim().split('=')
          return [k.trim(), decodeURIComponent(v.join('='))]
        })
      )

      const token = cookies[COOKIE_NAME]
      if (!token) return { session: null, status: 'unauthorized' }

      // Decrypt the JWE token
      const { payload } = await jwtDecrypt(token, getSecretKey, {
        // alg: PBES2 key-wrapping algorithm uses a random cryptographic Salt per token to secure the secret key derivation
        keyManagementAlgorithms: ['PBES2-HS256+A128KW'],
        // enc: AES-256-GCM content cipher uses a unique random IV (Initialization Vector) per encryption and computes a verification tag to detect tampering
        contentEncryptionAlgorithms: ['A256GCM'],
      })

      const session = payload as unknown as SessionData
      const now = Math.floor(Date.now() / 1000)

      // Absolute cap: 30 days
      if (now - session.issuedAt > 30 * 24 * 60 * 60) {
        return { session: null, status: 'expired' }
      }

      if (session.expiresAt < now) {
        return { session: null, status: 'expired' }
      }

      // Sliding window renewal logic
      const timeRemaining = session.expiresAt - now
      const threshold = SESSION_DURATION_SECONDS * 0.25

      if (timeRemaining < threshold) {
        // renew session silently
        await createSession({
          data: {
            sessionData: session,
            existingIssuedAt: session.issuedAt
          }
        })

        return { session, status: 'renewed' }
      }

      return { session, status: 'valid' }
    } catch (err) {
      console.error('[Session Decrypt] Failed:', err)
      // Invalid/tampered/expired token → treat as unauthenticated
      return { session: null, status: 'unauthorized' }
    }
  })

/**
 * Encrypt the session data and set it as an HttpOnly cookie on the response.
 */

export const createSession = createServerFn({ method: "POST" })
  .inputValidator(
    // Pass the Zod object directly instead of nesting it under an outer object
    z.object({
      sessionData: SessionData.omit({ issuedAt: true, expiresAt: true }),
      existingIssuedAt: z.number().optional(),
    })
  )
  // Let TanStack infer the input from the validator above
  .handler(async ({ data }): Promise<SessionResult> => {
    const { sessionData, existingIssuedAt } = data
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + SESSION_DURATION_SECONDS
    const issuedAt = existingIssuedAt ?? now

    // Correctly encrypt the full dataset including computed timestamps
    const fullSessionData: SessionData = { ...sessionData, expiresAt, issuedAt }

    // Encrypt with jose:
    // - PBES2-HS256+A128KW: Derives a wrapping key from our SESSION_SECRET using a freshly generated random Salt.
    // - A256GCM: Encrypts the payload with AES-256-GCM, generating a unique Initialization Vector (IV) and a message integrity tag.
    const token = await new EncryptJWT(fullSessionData)
      .setProtectedHeader({ alg: 'PBES2-HS256+A128KW', enc: 'A256GCM' })
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .encrypt(getSecretKey())

    const cookieValue = buildCookieString(COOKIE_NAME, token, SESSION_DURATION_SECONDS)
    setResponseHeader('Set-Cookie', cookieValue)

    // FIX: Must return a payload matching your SessionResult interface
    return {
      session: fullSessionData,
      status: existingIssuedAt ? 'renewed' : 'valid'
    }
  })


/**
 * Destroy the session by clearing the cookie (max-age=0).
 */
export async function destroySession(): Promise<void> {
  const cookieValue = buildCookieString(COOKIE_NAME, '', 0)
  setResponseHeader('Set-Cookie', cookieValue)
}

// ──────────────────────────────────────────────────────────────
// Helper: build the Set-Cookie string with security flags
// ──────────────────────────────────────────────────────────────
function buildCookieString(name: string, value: string, maxAge: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]

  // Only add Secure in production — localhost doesn't support HTTPS
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }

  return parts.join('; ')
}
