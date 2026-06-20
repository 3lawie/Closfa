import { createFileRoute } from '@tanstack/react-router'
import { getAuth0LogoutUrl } from '@/server/actions/ThirdParty/OAuth/auth0'
import { destroySession } from '@/server/lib/session'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      GET: async () => {
        await destroySession()
        const url = getAuth0LogoutUrl()
        return new Response(null, {
          status: 302,
          headers: { Location: url },
        })
      },
    },
  },
})
