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
import { redeemRoleKeyFn } from '@/server/actions/Database/services/role.service'
import { cn } from '@/lib/utils/cn'
import { isEmailDerivedNickname } from '@/lib/utils/format'

export const claimNicknameFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(claimNicknameValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ nickname: string }>> => {
    const { session } = context
    const cleanNickname = data.nickname.trim().toLowerCase()

    // Reject at claim time rather than only masking it later everywhere the
    // nickname is displayed — this is the exact "nickname === email" leak
    // that prompted this check, so it's better to never let it happen.
    if (isEmailDerivedNickname(cleanNickname, session.email)) {
      return err('BAD_REQUEST', 'For your privacy, please choose a nickname that is not based on your email address.')
    }

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
  const [roleKey, setRoleKey] = useState('')
  const [roleKeyMessage, setRoleKeyMessage] = useState('')
  const router = useRouter()

  // Independent of claimMutation below — a role key is a rare privileged
  // action, not part of the mandatory nickname-claim step, so it's a second,
  // separate action on this same page rather than merged into one handler.
  const redeemMutation = useMutation({
    mutationFn: () => redeemRoleKeyFn({ data: { code: roleKey } }),
    onSuccess: (res) => {
      setRoleKeyMessage(res.ok ? `Success — you are now ${res.data.role}.` : res.message)
      if (res.ok) setRoleKey('')
    },
    onError: () => setRoleKeyMessage('An error occurred — please try again.'),
  })

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
    <div className="grid min-h-screen w-full grid-cols-1 md:grid-cols-2 bg-bg">

      {/* Left Column - Visual Branding Pane. Fixed white text (not the
          swappable text-text token) — this panel is always a colored
          gradient regardless of mode/theme, so text needs to stay light
          for contrast rather than following the neutral-surface text color. */}
      <div className="relative flex flex-col justify-between p-8 md:p-16 bg-gradient-to-br from-accent to-accent-hover text-white">
        <div className="hidden md:block" />

        <div className="text-brand font-bold text-2xl tracking-tight">
          Closfa.
        </div>

        <div className="max-w-md space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight text-white">
            A quiet space to discover and share.
          </h1>
          <p className="text-lg text-white/90 leading-relaxed">
            Closfa is designed from zero with a rest-mode aesthetic, bringing you a clean, distraction-free environment to read, write, and engage with media.
          </p>
        </div>

        <div className="text-sm text-white/70">
          &copy; 2026 Closfa Inc. All rights reserved.
        </div>
      </div>

      {/* Right Column - Nickname Claim Form */}
      <div className="flex items-center justify-center p-6 md:p-16 bg-bg">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-text-h">
              Choose your nickname
            </h2>
            <p className="text-text-s">
              Set up your handle to publish and interact on Closfa.
            </p>
          </div>

          <div className="p-6 md:p-8 bg-surface border border-border rounded-lg shadow-sm space-y-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="nickname" className="block text-sm font-medium text-text-h">
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
                  className="w-full px-4 py-2 bg-bg border border-border text-text-h rounded-md focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                />
              </div>

              {/* Bot check */}
              <div className="flex justify-center">
                <TurnstileWidget
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken(undefined)}
                />
              </div>

              {error && (
                <div className="text-sm text-danger font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                isPending={loading}
                className="w-full"
              >
                Continue
              </Button>
            </form>

            {/* Second, independent entry point for admin/moderator key redemption. */}
            <div className="pt-6 border-t border-border space-y-4">
              <p className="text-sm font-medium text-text-s">Have a role key?</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roleKey}
                  onChange={(e) => setRoleKey(e.target.value)}
                  placeholder="e.g. ADM-xxxxxxxx"
                  className="flex-1 px-4 py-2 bg-bg border border-border text-text-h rounded-md focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => redeemMutation.mutate()}
                  isPending={redeemMutation.isPending}
                  disabled={!roleKey.trim()}
                >
                  Redeem
                </Button>
              </div>
              {roleKeyMessage && (
                <p className={cn(
                  "text-xs font-medium",
                  roleKeyMessage.startsWith('Success') ? "text-accent" : "text-danger"
                )}>
                  {roleKeyMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
