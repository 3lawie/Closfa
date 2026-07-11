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
import { Button } from '@/components/ui/Button'

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
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" style={{ backgroundColor: 'var(--bg)' }}>
      
      {/* Left Column - Visual Branding Pane */}
      <div 
        className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500 via-violet-600 to-zinc-950" />
        
        <div className="relative z-10">
          <span className="text-2xl font-black tracking-tight" style={{ color: 'var(--brand)' }}>
            Closfa.
          </span>
        </div>

        <div className="relative z-10 flex flex-col gap-4 max-w-md">
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight text-white m-0">
            A quiet space to discover and share.
          </h1>
          <p className="text-sm opacity-80 leading-relaxed">
            Closfa is designed from zero with a rest-mode aesthetic, bringing you a clean, distraction-free environment to read, write, and engage with media.
          </p>
        </div>

        <div className="relative z-10 text-xs opacity-50">
          &copy; 2026 Closfa Inc. All rights reserved.
        </div>
      </div>

      {/* Right Column - Nickname Claim Form */}
      <div className="flex flex-col justify-center py-12 px-6 sm:px-12 lg:px-16" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-h)' }}>
              Choose your nickname
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-s)' }}>
              Set up your handle to publish and interact on Closfa.
            </p>
          </div>

          <div className="py-8 px-6 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="nickname" className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-h)' }}>
                  Nickname
                </label>
                <input
                  id="nickname"
                  name="nickname"
                  type="text"
                  required
                  placeholder="e.g. janesmith"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  style={{ backgroundColor: 'var(--bg)', color: 'var(--text-h)', borderColor: 'var(--border)' }}
                  className="appearance-none block w-full px-4 py-3 border rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all text-sm"
                />
              </div>

              {/* Bot check */}
              <TurnstileWidget
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken(undefined)}
              />

              {error && (
                <div className="text-red-500 text-xs font-medium">{error}</div>
              )}

              <Button
                type="submit"
                isPending={loading}
                className="w-full py-3"
              >
                Continue
              </Button>
            </form>
          </div>
        </div>
      </div>

    </div>
  )
}
