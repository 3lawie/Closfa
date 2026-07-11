import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { createSession } from '@/server/lib/session'
import { useState } from 'react'
import { authMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { claimNicknameValidation } from '@/verification/profile.validation'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { verifyTurnstileToken } from '@/server/lib/turnstile'
import { TurnstileWidget } from '@/components/auth/TurnstileWidget'

export const claimNicknameFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(claimNicknameValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ nickname: string }>> => {
    const { session } = context
    const cleanNickname = data.nickname.trim().toLowerCase()

    // Bot gate — fail-closed in production, bypassed in dev without keys.
    const human = await verifyTurnstileToken(data.turnstileToken)
    if (!human) {
      return err('FORBIDDEN', 'Verification failed — please retry the challenge.')
    }

    try {
      await db.update(schema.user)
        .set({ nickname: cleanNickname })
        .where(eq(schema.user.userId, session.userId))

      // Re-mint the cookie WITH the new nickname — reusing the old session
      // object verbatim would bake the stale `nickname: null` into the fresh
      // cookie and the app would still treat the user as un-onboarded.
      await createSession({
        sessionData: { ...session, nickname: cleanNickname },
        existingIssuedAt: session.issuedAt,
      })

      return ok({ nickname: cleanNickname })
    } catch (e) {
      // Postgres unique-violation → the nickname is taken (expected failure).
      const pgError = e as { code?: string; constraint?: string }
      if (pgError.code === '23505' || pgError.constraint === 'name is already taken') {
        return err('BAD_REQUEST', 'This nickname is already taken by another user.')
      }
      logger.error('claimNickname failed', { userId: session.userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'An error occurred while claiming your nickname.')
    }
  })

export const Route = createFileRoute('/onboarding')({
  beforeLoad: ({ context }) => {
    // Session already decrypted once by the root route — read from context.
    const { session, sessionStatus } = context
    if (!session || sessionStatus === 'expired' || sessionStatus === 'unauthorized') {
      throw redirect({ href: '/api/auth/login' })
    }
    // If they already have a nickname, they shouldn't be here
    if (session.nickname) {
      throw redirect({ href: '/' })
    }
    return { session }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined)
  const router = useRouter()

  // Mirrors the PostCard likeMutation pattern: mutation owns pending state,
  // expected failures arrive as { ok: false } results, not thrown errors.
  const claimMutation = useMutation({
    mutationFn: (value: string) =>
      claimNicknameFn({ data: { nickname: value, turnstileToken } }),
    onSuccess: (res) => {
      if (res.ok) {
        router.navigate({ to: '/' })
      } else {
        setError(res.message)
      }
    },
    onError: () => {
      setError('An error occurred — please try again.')
    },
  })
  const loading = claimMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    claimMutation.mutate(nickname)
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

            {/* Bot check — renders only when VITE_TURNSTILE_SITE_KEY is set;
                the server fails closed in production without a valid token. */}
            <TurnstileWidget
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(undefined)}
            />

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
