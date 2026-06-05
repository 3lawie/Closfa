import { createAPIFileRoute } from '@tanstack/react-start/api'
import { exchangeCodeForToken, getUserInfo } from '@/server/auth/auth0'
import { createSession } from '@/server/auth/session'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

export const APIRoute = createAPIFileRoute('/api/auth/callback')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')

    if (!code) {
      return new Response('Missing code', { status: 400 })
    }

    try {
      const tokens = await exchangeCodeForToken(code)
      const userInfo = await getUserInfo(tokens.access_token)

      const auth0Id = userInfo.sub

      let user = await db.query.user.findFirst({
        where: eq(schema.user.auth0Id, auth0Id),
      })

      if (!user) {
        const userId = createId()
        await db.insert(schema.user).values({
          userId,
          auth0Id,
          email: userInfo.email,
          username: userInfo.nickname || userInfo.name || userId,
          role: 'user',
        })
        user = { userId, auth0Id } as any
      }

      await createSession({
        userId: user.userId,
        sub: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        nickname: userInfo.nickname,
      })

      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      })
    } catch (err) {
      console.error('Auth callback failed:', err)
      return new Response('Authentication Failed', { status: 500 })
    }
  },
})
