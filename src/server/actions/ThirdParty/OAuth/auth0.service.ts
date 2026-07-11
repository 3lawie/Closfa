// ──────────────────────────────────────────────────────────────
// Auth0 Service — the server-side auth callback orchestration.
//
// Routes call processAuthCallback; the raw auth0.ts helpers are
// NOT called directly from routes.
// ──────────────────────────────────────────────────────────────

import { exchangeCodeForToken, getUserInfo, validateAndNormalizeUserInfo, sanitizeReturnTo } from '@/server/actions/ThirdParty/OAuth/auth0'
import { createSession } from '@/server/lib/session'
import { upsertAuthUser } from '@/server/actions/Database/services/user.service'

export async function processAuthCallback(code: string, state: string) {
  // ── Step 1: Exchange authorization code for tokens (server-to-server) ──
  // Also validates the state parameter to prevent CSRF
  const { tokens, returnTo } = await exchangeCodeForToken(code, state)

  // ── Step 2: Fetch user profile from Auth0 (server-to-server) ──
  // getUserInfo already runs Zod validation and throws if data is bad!
  const rawUserInfo = await getUserInfo(tokens.access_token)
  const userInfo = validateAndNormalizeUserInfo(rawUserInfo)

  // ── Step 3: Upsert user in DB ──
  const finalUser = await upsertAuthUser(userInfo)
  const needsOnboarding = !finalUser.nickname;

  // ── Step 4: Create encrypted session cookie ──
  await createSession({
    sessionData: {
      userId: finalUser.userId,
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      nickname: finalUser.nickname,
    },
  })

  // ── Step 5: Return redirect URL ──
  // Onboarding always wins; otherwise honor the sanitized deep link.
  // Re-sanitizing here is defense in depth — the redirect IS the attack surface.
  return needsOnboarding ? '/onboarding' : sanitizeReturnTo(returnTo) ?? '/'
}
