// ──────────────────────────────────────────────────────────────
// Auth0 Callback — Authorization Code + PKCE exchange
//
// This is the ONLY route that touches Auth0 tokens.
// Tokens never reach the browser — they stay on the server.
// The browser receives only an encrypted HttpOnly session cookie.
// ──────────────────────────────────────────────────────────────

import { createFileRoute } from '@tanstack/react-router'
import { exchangeCodeForToken, getUserInfo } from '@/server/actions/ThirdParty/OAuth/auth0'
import { validateAndNormalizeUserInfo } from '@/server/actions/ThirdParty/OAuth/auth0.service'
import { createSession } from '@/server/lib/session'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        if (!code || !state) {
          return new Response('Missing code or state parameter', { status: 400 })
        }

        try {
          // ── Step 1: Exchange authorization code for tokens (server-to-server) ──
          // Also validates the state parameter to prevent CSRF
          const tokens = await exchangeCodeForToken(code, state)

          // ── Step 2: Fetch user profile from Auth0 (server-to-server) ──
          const rawUserInfo = await getUserInfo(tokens.access_token)
          const userInfo = validateAndNormalizeUserInfo(rawUserInfo as unknown as Record<string, unknown>)

          // ── Step 3: Upsert user in DB ──
          let user = await db.query.user.findFirst({
            where: { authProviderId: userInfo.sub },
          })

          if (!user) {
            // First login — create the user record
            const userId = createId()

            await db.insert(schema.user).values({
              userId,
              name: userInfo.name,
              nickname: null, // Must be claimed during onboarding
              email: userInfo.email,
              authProviderId: userInfo.sub,
              authProvider: userInfo.authProvider,
              emailVerified: userInfo.email_verified ?? false,
            })

            // Create the user's profile record (one-to-one with user)
            await db.insert(schema.profile).values({
              profile_id: createId(),
              userId,
              isVerified: false,
            })

            user = { userId, authProviderId: userInfo.sub, nickname: null } as any
          }

          const finalUser = user!
          const needsOnboarding = !finalUser.nickname;

          // ── Step 4: Create encrypted session cookie ──
          await createSession({
            userId: finalUser.userId,
            sub: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            nickname: finalUser.nickname,
          })

          // ── Step 5: Redirect to app ──
          return new Response(null, {
            status: 302,
            headers: { Location: needsOnboarding ? '/onboarding' : '/' },
          })
        } catch (err) {
          console.error('[Auth Callback] Failed:', err)
          return new Response('Authentication failed. Please try again.', { status: 500 })
        }
      },
    },
  },
})
