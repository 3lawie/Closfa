import { createFileRoute } from '@tanstack/react-router'
import { getAuth0LoginUrl } from '@/server/actions/ThirdParty/OAuth/auth0'
import { checkRateLimit } from '@/server/lib/rateLimiter'
import { logger } from '@/server/lib/logger'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Auth routes run before any session exists — stricter IP-keyed tier.
        try {
          await checkRateLimit(null, { limiter: 'auth' })
        } catch {
          return new Response('Too many login attempts. Please try again shortly.', { status: 429 })
        }

        try {
          // Optional deep link to land on after login — sanitized inside
          // getAuth0LoginUrl (open-redirect guard), carried via the PKCE
          // state cookie, honored by the callback.
          const returnTo = new URL(request.url).searchParams.get('returnTo')
          const url = await getAuth0LoginUrl(returnTo)
          return new Response(null, {
            status: 302,
            headers: { Location: url },
          })
        } catch (error) {
          // Log the real error server-side; never leak message/stack to the
          // client (security#4, ux#10).
          logger.error('auth login failed', undefined, error instanceof Error ? error : undefined)
          return new Response('Unable to start login. Please try again.', { status: 500 })
        }
      },
    },
  },
})
