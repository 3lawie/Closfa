import { Link } from '@tanstack/react-router'
import type { SessionData } from '@/server/lib/session'

export function Navbar({ session }: { session: SessionData | null }) {
  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="max-w-[680px] mx-auto px-4 h-14 flex justify-between items-center">
        {/* Logo — amber brand */}
        <Link
          to="/"
          className="text-xl font-black tracking-tight"
          style={{ color: 'var(--brand)' }}
        >
          Closfa.
        </Link>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link
                to="/dashboard"
                className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text)' }}
                activeProps={{ style: { color: 'var(--accent)', background: 'var(--accent-bg)' } }}
              >
                Dashboard
              </Link>

              {/* Avatar chip */}
              <a
                href="/api/auth/logout"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{ color: 'var(--text)', background: 'var(--social-bg)', border: '1px solid var(--border)' }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {session.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:block">{session.nickname}</span>
                <span className="text-xs" style={{ color: 'var(--text-s)' }}>↩</span>
              </a>
            </>
          ) : (
            /* Login button — amber border + purple hover glow */
            <a
              href="/api/auth/login"
              className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: 'var(--accent-bg)',
                border: '1.5px solid var(--accent-border)',
                color: 'var(--accent)',
              }}
            >
              <span
                className="inline-block transition-transform duration-300 group-hover:-translate-y-0.5"
                style={{ color: 'var(--brand)' }}
              >
                ★
              </span>
              Log in
            </a>
          )}
        </div>
      </div>
    </nav>
  )
}
