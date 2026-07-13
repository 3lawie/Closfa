// ──────────────────────────────────────────────────────────────
// Auth Components — Login/Logout buttons and AuthGuard
// ──────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils/cn'
import type { PublicSessionData } from '@/server/lib/session'

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
        'inline-flex items-center justify-center px-4 py-2 rounded-md font-medium transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        'bg-accent text-white hover:bg-accent-hover shadow-sm active:scale-95',
        className
      )}>
      {label}
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
        'inline-flex items-center justify-center px-4 py-2 rounded-md font-medium transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        'bg-surface border border-border text-text hover:bg-accent-bg hover:text-accent shadow-sm active:scale-95',
        className
      )}>
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
  session: PublicSessionData | null
  authenticated: React.ReactNode
  unauthenticated: React.ReactNode
}

export function AuthGuard({ session, authenticated, unauthenticated }: AuthGuardProps) {
  return session ? <>{authenticated}</> : <>{unauthenticated}</>
}
