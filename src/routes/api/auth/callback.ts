// ──────────────────────────────────────────────────────────────
// Auth0 Callback — Authorization Code + PKCE exchange
//
// This is the ONLY route that touches Auth0 tokens.
// Tokens never reach the browser — they stay on the server.
// The browser receives only an encrypted HttpOnly session cookie.
// ──────────────────────────────────────────────────────────────

import { createFileRoute } from '@tanstack/react-router'
import { exchangeCodeForToken, getUserInfo } from '@/server/auth/auth0'
import { createSession } from '@/server/auth/session'
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
          const userInfo = await getUserInfo(tokens.access_token)

          // ── Step 3: Upsert user in DB ──
          // authProviderId = Auth0's "sub" (e.g. "auth0|abc123" or "google-oauth2|xyz")
          let user = await db.query.user.findFirst({
            where: eq(schema.user.authProviderId, userInfo.sub),
          })

          if (!user) {
            // First login — create the user record
            const userId = createId()

            // Generate a unique nickname: use Auth0 nickname, fall back to email local part
            const rawNickname = userInfo.nickname || userInfo.email.split('@')[0]
            // Sanitize to alphanumeric + underscores, max 30 chars
            const nickname = rawNickname.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30)

            await db.insert(schema.user).values({
              userId,
              name: userInfo.name,
              nickname,
              email: userInfo.email,
              authProviderId: userInfo.sub,
              authProvider: userInfo.sub.split('|')[0], // e.g. "auth0", "google-oauth2"
              emailVerified: userInfo.email_verified ?? false,
            })

            // Create the user's profile record (one-to-one with user)
            await db.insert(schema.profile).values({
              profile_id: createId(),
              userId,
              isVerified: false,
            })

            user = { userId, authProviderId: userInfo.sub } as typeof user
          }

          // ── Step 4: Create encrypted session cookie ──
          await createSession({
            userId: user!.userId,
            sub: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            nickname: userInfo.nickname || '',
          })

          // ── Step 5: Redirect to app ──
          return new Response(null, {
            status: 302,
            headers: { Location: '/' },
          })
        } catch (err) {
          console.error('[Auth Callback] Failed:', err)
          return new Response('Authentication failed. Please try again.', { status: 500 })
        }
      },
    },
  },
})
