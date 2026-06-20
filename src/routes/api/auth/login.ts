import { createFileRoute } from '@tanstack/react-router'
import { getAuth0LoginUrl } from '@/server/actions/ThirdParty/OAuth/auth0'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      GET: async () => {
        const url = await getAuth0LoginUrl()
        return new Response(null, {
          status: 302,
          headers: { Location: url },
        })
      },
    },
  },
})
