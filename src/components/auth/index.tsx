// ──────────────────────────────────────────────────────────────
// Auth Components — Login/Logout buttons and AuthGuard
// ──────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils/cn'
import type { SessionData } from '@/server/lib/session'

// ──────────────────────────────────────────────────────────────
// LoginButton — navigates to the server-side Auth0 login flow
// ──────────────────────────────────────────────────────────────
interface LoginButtonProps {
  className?: string
  label?: string
}

export function LoginButton({ className, label = 'Log in to Closfa' }: LoginButtonProps) {
  return (
    <a
      href="/api/auth/login"
      className={cn(
        'group inline-flex items-center gap-2',
        'text-black bg-gray-100 border-[3px] border-amber-500',
        'transition-colors px-5 py-2 rounded-lg font-medium shadow-amber-200 shadow-md',
        className,
      )}
    >
      <span className="inline-block text-amber-500 transition-all duration-300 group-hover:-translate-y-0.5">
        {label.split(' ')[0]}
      </span>
      {' '}
      {label.split(' ').slice(1).join(' ')}
    </a>
  )
}

// ──────────────────────────────────────────────────────────────
// LogoutButton — calls the server-side logout + Auth0 logout
// ──────────────────────────────────────────────────────────────
interface LogoutButtonProps {
  className?: string
}

export function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <a
      href="/api/auth/logout"
      className={cn(
        'inline-block bg-red-50 text-red-600 hover:bg-red-100',
        'transition-colors px-5 py-2 rounded-lg font-medium border border-red-200',
        className,
      )}
    >
      Log Out
    </a>
  )
}

// ──────────────────────────────────────────────────────────────
// AuthGuard — conditionally renders children based on auth state
// Use inside non-authenticated routes (like index.tsx) where you
// want to show different UI for logged-in vs guest users.
// For actual route protection, use the _authenticated layout route.
// ──────────────────────────────────────────────────────────────
interface AuthGuardProps {
  session: SessionData | null
  authenticated: React.ReactNode
  unauthenticated: React.ReactNode
}

export function AuthGuard({ session, authenticated, unauthenticated }: AuthGuardProps) {
  return session ? <>{authenticated}</> : <>{unauthenticated}</>
}
