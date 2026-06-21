// ──────────────────────────────────────────────────────────────
// Auth0 Callback — Authorization Code + PKCE exchange
//
// This is the ONLY route that touches Auth0 tokens.
// Tokens never reach the browser — they stay on the server.
// The browser receives only an encrypted HttpOnly session cookie.
// ──────────────────────────────────────────────────────────────

import { createFileRoute } from '@tanstack/react-router'
import { processAuthCallback } from '@/server/actions/ThirdParty/OAuth/auth0.service'

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
          const redirectUrl = await processAuthCallback(code, state)

          // ── Step 5: Redirect to app ──
          return new Response(null, {
            status: 302,
            headers: { Location: redirectUrl },
          })
        } catch (err) {
          console.error('[Auth Callback] Failed:', err)
          return new Response('Authentication failed. Please try again.', { status: 500 })
        }
      },
    },
  },
})
