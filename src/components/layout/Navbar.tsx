import { Link } from '@tanstack/react-router'
import type { SessionData } from '@/server/auth/session'

function LoginButton() {
  return (
    <a
      href="/api/auth/login"
      className="group text-black bg-gray-100 border-[3px] border-blue-500 transition-colors px-5 py-2 rounded-lg font-medium shadow-amber-200 shadow-md inline-block"
    >
      <span className="inline-block text-amber-500 transition-all duration-300 group-hover:-translate-y-1">
        Log
      </span> In to Closfa
    </a>
  )
}

function LogoutButton() {
  return (
    <a
      href="/api/auth/logout"
      className="bg-red-50 text-red-600 hover:bg-red-100 transition-colors px-5 py-2 rounded-lg font-medium border border-blue-500 inline-block"
    >
      Log Out
    </a>
  )
}

export function Navbar({ session }: { session: SessionData | null }) {
  const isAuthenticated = !!session

  return (
    <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold tracking-tight !text-amber-500">
          Closfa.
        </Link>

        <div className="flex items-center gap-6">
          <Link
            to="/Todo"
            className="text-gray-600 hover:text-black transition-colors font-medium !text-blue-500"
          >
            Vision Board
          </Link>
          {isAuthenticated && (
            <Link
              to="/dashboard"
              className="text-gray-600 hover:text-black transition-colors font-medium"
            >
              Dashboard
            </Link>
          )}
          {isAuthenticated ? <LogoutButton /> : <LoginButton />}
        </div>
      </div>
    </nav>
  )
}
