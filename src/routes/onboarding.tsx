import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { getSessionFn } from '@/server/lib/sessionFn'
import { createServerFn } from '@tanstack/react-start'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { createSession } from '@/server/lib/session'
import { useState } from 'react'
import { authMiddleware } from '@/server/lib/middleware'

export const claimNicknameFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { nickname: string }) => data)
  .handler(async ({ data, context }) => {
    const { session } = context
    const cleanNickname = data.nickname.trim().toLowerCase()

    if (cleanNickname.length < 3) {
      throw new Error('Nickname must be at least 3 characters')
    }

    try {
      await db.update(schema.user)
        .set({ nickname: cleanNickname })
        .where(eq(schema.user.userId, session.userId))

      await createSession({
        userId: session.userId,
        sub: session.sub,
        email: session.email,
        name: session.name,
        nickname: cleanNickname,
      }, session.issuedAt)

      return { ok: true }
    } catch (e) {
      // In a real app we'd check Postgres constraint errors for uniqueness
      throw new Error('Nickname is already taken or invalid')
    }
  })

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    const result = await getSessionFn()
    if (!result.session || result.status === 'expired' || result.status === 'unauthorized') {
      throw redirect({ href: '/api/auth/login' })
    }
    // If they already have a nickname, they shouldn't be here
    if (result.session.nickname) {
      throw redirect({ href: '/' })
    }
    return { session: result.session }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await claimNicknameFn({ data: { nickname } })
      router.navigate({ to: '/' })
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold" style={{ color: 'var(--text-h)' }}>
          Choose your nickname
        </h2>
        <p className="mt-2 text-center text-sm" style={{ color: 'var(--text-s)' }}>
          This is how others will see you on the platform.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="py-8 px-4 shadow sm:rounded-lg sm:px-10" style={{ backgroundColor: 'var(--surface)' }}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium" style={{ color: 'var(--text-h)' }}>
                Nickname
              </label>
              <div className="mt-1">
                <input
                  id="nickname"
                  name="nickname"
                  type="text"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  style={{ backgroundColor: 'var(--bg)', color: 'var(--text-h)', borderColor: 'var(--border)' }}
                  className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: 'var(--brand)', color: 'white' }}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
