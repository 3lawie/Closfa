import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getAuth0LogoutUrl } from '@/server/auth/auth0'
import { destroySession } from '@/server/auth/session'

export const APIRoute = createAPIFileRoute('/api/auth/logout')({
  GET: async () => {
    await destroySession()
    const url = getAuth0LogoutUrl()
    return new Response(null, {
      status: 302,
      headers: { Location: url },
    })
  },
})
