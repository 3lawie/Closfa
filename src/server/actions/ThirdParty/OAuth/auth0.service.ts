// ──────────────────────────────────────────────────────────────
// Auth0 Service — createServerFn wrappers for Auth0 operations
//
// These are exposed as TanStack Start server functions so React
// components can trigger auth actions via typed RPC calls.
// The raw auth0.ts helpers are NOT called directly from routes —
// routes call these server functions which add validation + logging.
// ──────────────────────────────────────────────────────────────

import { createServerFn } from '@tanstack/react-start'
import { exchangeCodeForToken, getUserInfo, type UserInfoFromToken } from '@/server/actions/ThirdParty/OAuth/auth0'
import { getSession, createSession } from '@/server/lib/session'
import { upsertAuthUser } from '@/server/actions/Database/services/user.service'

export async function processAuthCallback(code: string, state: string) {
  // ── Step 1: Exchange authorization code for tokens (server-to-server) ──
  // Also validates the state parameter to prevent CSRF
  const tokens = await exchangeCodeForToken(code, state)

  // ── Step 2: Fetch user profile from Auth0 (server-to-server) ──
  // getUserInfo already runs Zod validation and throws if data is bad!
  const rawUserInfo = await getUserInfo(tokens.access_token)
  const userInfo = validateAndNormalizeUserInfo(rawUserInfo)

  // ── Step 3: Upsert user in DB ──
  const finalUser = await upsertAuthUser(userInfo)
  const needsOnboarding = !finalUser.nickname;

  // ── Step 4: Create encrypted session cookie ──
  await createSession({
    userId: finalUser.userId,
    sub: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name,
    nickname: finalUser.nickname,
  })

  // ── Step 5: Return redirect URL ──
  return needsOnboarding ? '/onboarding' : '/'
}

/**
 * Get the Auth0 user info for the currently logged-in user.
 * Requires an active session (access_token is NOT stored — this
 * demonstrates that once you have a session, you don't need Auth0 again).
 *
 * NOTE: In most cases you should read from the DB via queries.user.getById()
 * instead. This function is only needed if you need fresh Auth0 profile data
 * (e.g., after a social profile update).
 */
export const getAuth0UserInfo = createServerFn({ method: 'GET' })
  .handler(async (): Promise<UserInfoFromToken | null> => {
    const session = await getSession()
    if (!session) return null

    // We don't store the access_token — this serves as a demo of the pattern.
    // In a real implementation, you'd store the access_token in the session
    // if you need to make recurring Auth0 API calls.
    return null
  })

export function validateAndNormalizeUserInfo(userInfo: UserInfoFromToken) {
  // Normalize nickname: sanitize to safe chars, max 30
  const rawNickname = userInfo.nickname || userInfo.email.split('@')[0]
  const nickname = rawNickname.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30)

  // Derive auth provider name from Auth0 sub prefix
  // e.g. "auth0|abc" → "auth0", "google-oauth2|abc" → "google-oauth2"
  const authProvider = userInfo.sub.split('|')[0] || 'auth0'

  return { ...userInfo, nickname, authProvider }
}
