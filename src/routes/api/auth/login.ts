import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getAuth0LoginUrl } from '@/server/auth/auth0'

export const APIRoute = createAPIFileRoute('/api/auth/login')({
  GET: async () => {
    const url = await getAuth0LoginUrl()
    return new Response(null, {
      status: 302,
      headers: { Location: url },
    })
  },
})
