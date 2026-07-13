import { createFileRoute } from '@tanstack/react-router'
import { createSession } from '@/server/lib/session'

export const Route = createFileRoute('/api/auth/mock-login')({
  server: {
    handlers: {
      GET: async () => {
        // Dev-only convenience login — bypasses Auth0 entirely, so it must
        // never be reachable once deployed. Without this guard it was a live
        // authentication bypass: anyone hitting this route in production got
        // signed in as the hardcoded account below.
        if (process.env.NODE_ENV === 'production') {
          return new Response('Not found', { status: 404 })
        }

        try {
          await createSession({
            sessionData: {
              userId: 'xjzpmpzdkpjv6hgrrqy87ylx',
              sub: 'google-oauth2|107981750522723863495',
              email: 'ali.muhannad.mcce22@uoitc.edu.iq',
              name: 'Ali Muhannad Kareem Hassan',
              nickname: 'ali mohand kareem',
            }
          })
          
          return new Response(null, {
            status: 302,
            headers: { Location: '/dashboard' },
          })
        } catch (error) {
          console.error("Mock login failed:", error)
          return new Response('Mock login failed', { status: 500 })
        }
      },
    },
  },
})
