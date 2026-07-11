import { createFileRoute } from '@tanstack/react-router'
import { getAuth0LoginUrl } from '@/server/actions/ThirdParty/OAuth/auth0'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const url = await getAuth0LoginUrl()
          return new Response(null, {
            status: 302,
            headers: { Location: url },
          })
        } catch (error) {
          // Log the real error server-side; never leak message/stack to the
          // client (security#4, ux#10).
          console.error('[Auth Login] Failed:', error)
          return new Response('Unable to start login. Please try again.', { status: 500 })
        }
      },
    },
  },
})
