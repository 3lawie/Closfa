import { Link } from '@tanstack/react-router'
import type { SessionData } from '@/server/lib/session'

export function Navbar({ session }: { session: SessionData | null }) {
  return (
    <nav
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        background: 'var(--surface-translucent, rgba(255, 255, 255, 0.75))',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="max-w-[680px] mx-auto px-4 h-16 flex justify-between items-center">
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
                to="/create"
                className="text-sm font-semibold px-4 py-2 rounded-full transition-all duration-200"
                style={{ color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}
                activeProps={{ style: { color: 'white', background: 'var(--accent)' } }}
              >
                + New Post
              </Link>

              <Link
                to="/dashboard"
                className="text-sm font-semibold px-3 py-2 rounded-full transition-all duration-200"
                style={{ color: 'var(--text)' }}
                activeProps={{ style: { color: 'var(--accent)', background: 'var(--accent-bg)' } }}
              >
                Dashboard
              </Link>

              {/* Notifications Button */}
              <Link
                search={(prev) => ({ ...prev, notifications: true })}
                className="relative text-sm font-semibold p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors"
                style={{ color: 'var(--text)' }}
              >
                🔔
              </Link>

              {/* Logout/Profile Avatar */}
              <a
                href="/api/auth/logout"
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors"
                title="Log out"
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                  style={{ background: 'var(--accent)' }}
                >
                  {session.name.charAt(0).toUpperCase()}
                </span>
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
