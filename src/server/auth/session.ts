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

/** What we store inside the session cookie */
export type SessionData = {
  userId: string
  sub: string      // Auth0 subject identifier (auth_provider_id)
  email: string
  name: string
  nickname: string
  expiresAt: number // Unix timestamp
}

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
export async function getSession(): Promise<SessionData | null> {
  try {
    const request = getRequest()
    if (!request) return null

    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) return null

    // Parse cookies manually — no cookie-parser dependency needed
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c: string) => {
        const [k, ...v] = c.trim().split('=')
        return [k.trim(), decodeURIComponent(v.join('='))]
      })
    )

    const token = cookies[COOKIE_NAME]
    if (!token) return null

    // Decrypt the JWE token
    const { payload } = await jwtDecrypt(token, getSecretKey(), {
      keyManagementAlgorithms: ['PBES2-HS256+A128KW'],
      contentEncryptionAlgorithms: ['A256GCM'],
    })

    const session = payload as unknown as SessionData

    // Check expiry (belt-and-suspenders — jose also validates exp claim)
    if (session.expiresAt < Math.floor(Date.now() / 1000)) {
      return null
    }

    return session
  } catch (err) {
    console.error('[Session Decrypt] Failed:', err)
    // Invalid/tampered/expired token → treat as unauthenticated
    return null
  }
}

/**
 * Encrypt the session data and set it as an HttpOnly cookie on the response.
 */
export async function createSession(data: Omit<SessionData, 'expiresAt'>): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS

  const sessionData: SessionData = { ...data, expiresAt }

  // Encrypt with jose — PBES2-HS256+A128KW key wrap + A256GCM content encryption
  const token = await new EncryptJWT(sessionData as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'PBES2-HS256+A128KW', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .encrypt(getSecretKey())

  const cookieValue = buildCookieString(COOKIE_NAME, token, SESSION_DURATION_SECONDS)
  setResponseHeader('Set-Cookie', cookieValue)
}

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
