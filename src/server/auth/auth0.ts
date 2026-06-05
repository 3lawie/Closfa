// ──────────────────────────────────────────────────────────────
// Auth0 Service — Authorization Code Flow + PKCE (server-side)
//
// WHY server-side auth instead of the @auth0/auth0-react SPA SDK?
//
//   SPA (old approach — what we removed):
//   • Client receives tokens directly in the browser
//   • Tokens stored in JavaScript memory (vulnerable to XSS)
//   • Any script injection can steal access_token / id_token
//   • PKCE helps but tokens still land in the browser
//
//   BFF (Backend For Frontend — what we use now):
//   • Client NEVER sees any Auth0 tokens
//   • Authorization code is exchanged on the SERVER
//   • Only an opaque encrypted session cookie reaches the browser
//   • HttpOnly + SameSite=Lax prevents JS access entirely
//   • Zero XSS risk on tokens — even if page is injected, tokens
//     are on the server, not in browser memory or localStorage
//
// Flow:
//   1. Browser → /api/auth/login → server builds Auth0 URL with PKCE
//   2. Auth0 shows Universal Login page (branded)
//   3. Auth0 → /api/auth/callback?code=xxx&state=yyy
//   4. Server exchanges code for tokens (server-to-server call)
//   5. Server upserts user in DB, creates encrypted session cookie
//   6. Browser gets ONLY the HttpOnly cookie (no tokens)
// ──────────────────────────────────────────────────────────────

import { getRequest, setResponseHeader } from '@tanstack/react-start/server'

// ──────────────────────────────────────────────────────────────
// PKCE Helpers
// ──────────────────────────────────────────────────────────────

/** Generate a cryptographically random code_verifier (43-128 chars) */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/** Derive code_challenge = BASE64URL(SHA-256(code_verifier)) */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

/** BASE64URL encoding (no padding, URL-safe chars) */
function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// ──────────────────────────────────────────────────────────────
// State cookie — stores PKCE verifier and CSRF state during flow
// ──────────────────────────────────────────────────────────────
const STATE_COOKIE = 'auth0_state'

function setStateCookie(state: string, codeVerifier: string): void {
  // Short-lived cookie (10 minutes) — only needed during the auth redirect
  const value = JSON.stringify({ state, codeVerifier })
  const cookie = [
    `${STATE_COOKIE}=${encodeURIComponent(value)}`,
    'Max-Age=600',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ')
  setResponseHeader('Set-Cookie', cookie)
}

function getStateCookie(): { state: string; codeVerifier: string } | null {
  try {
    const request = getRequest()
    if (!request) return null
    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) return null
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c: string) => {
        const [k, ...v] = c.trim().split('=')
        return [k.trim(), decodeURIComponent(v.join('='))]
      })
    )
    const raw = cookies[STATE_COOKIE]
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearStateCookie(): void {
  const cookie = [
    `${STATE_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ')
  setResponseHeader('Set-Cookie', cookie)
}

// ──────────────────────────────────────────────────────────────
// Auth0 config helpers
// ──────────────────────────────────────────────────────────────

function getAuth0Config() {
  const domain = process.env.AUTH0_DOMAIN
  const clientId = process.env.AUTH0_CLIENT_ID
  const clientSecret = process.env.AUTH0_CLIENT_SECRET

  if (!domain || !clientId || !clientSecret) {
    throw new Error('Missing Auth0 environment variables (AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET)')
  }

  return { domain, clientId, clientSecret }
}

function getCallbackUrl(): string {
  // In production, the Cloudflare Worker URL / custom domain
  // In dev, always localhost:3000
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return `${base}/api/auth/callback`
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Build the Auth0 authorization URL with PKCE.
 * Stores code_verifier + state in a temporary cookie so we can
 * verify them when Auth0 redirects back.
 */
export async function getAuth0LoginUrl(): Promise<string> {
  const { domain, clientId } = getAuth0Config()

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))

  // Persist verifier and state for callback validation
  setStateCookie(state, codeVerifier)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    scope: 'openid profile email',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
  })

  return `https://${domain}/authorize?${params.toString()}`
}

/** Token response shape from Auth0 /oauth/token */
type TokenResponse = {
  access_token: string
  id_token?: string
  expires_in: number
  token_type: string
}

/**
 * Exchange the authorization code for tokens.
 * Also verifies the state parameter to prevent CSRF attacks.
 * Returns the access_token for use with /userinfo.
 */
export async function exchangeCodeForToken(
  code: string,
  returnedState: string,
): Promise<TokenResponse> {
  const { domain, clientId, clientSecret } = getAuth0Config()

  // Read and clear the state cookie
  const stored = getStateCookie()
  clearStateCookie()

  if (!stored) {
    throw new Error('Auth state cookie missing — possible CSRF or expired flow')
  }

  if (stored.state !== returnedState) {
    throw new Error('State mismatch — possible CSRF attack')
  }

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: getCallbackUrl(),
      code_verifier: stored.codeVerifier,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Auth0 token exchange failed: ${error}`)
  }

  return response.json() as Promise<TokenResponse>
}

/** User info shape from Auth0 /userinfo */
export type Auth0UserInfo = {
  sub: string            // Unique user ID: "auth0|abc123" or "google-oauth2|xyz"
  name: string           // Full name
  nickname: string       // Username/handle (usually email local part)
  email: string
  email_verified: boolean
  picture?: string       // Profile picture URL from the identity provider
}

/**
 * Fetch the authenticated user's profile from Auth0.
 * Uses the access_token — this call is server-to-server.
 */
export async function getUserInfo(accessToken: string): Promise<Auth0UserInfo> {
  const { domain } = getAuth0Config()

  const response = await fetch(`https://${domain}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Auth0 user info: ${response.status}`)
  }

  return response.json() as Promise<Auth0UserInfo>
}

/**
 * Build the Auth0 logout URL that clears the Auth0 SSO session.
 * After redirect, Auth0 will send the user back to our app root.
 */
export function getAuth0LogoutUrl(): string {
  const { domain, clientId } = getAuth0Config()
  const base = process.env.APP_URL ?? 'http://localhost:3000'

  const params = new URLSearchParams({
    client_id: clientId,
    returnTo: base,
  })

  return `https://${domain}/v2/logout?${params.toString()}`
}
