import { useEffect, useRef, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MoreHorizontal, LayoutDashboard, PenSquare, Bookmark, Settings, LogOut, FileStack } from 'lucide-react'
import { getUnreadNotificationCountFn } from '@/server/actions/Database/services/notification.service'
import type { PublicSessionData } from '@/server/lib/session'

const rootRouteApi = getRouteApi('__root__')

// Fixed bottom-left account cluster — replaces the old full-width sidebar.
// Stack, top to bottom: notification heart, more-menu (dashboard/publish/
// logout), account avatar (routes to the viewer's own profile).
export function AccountRail({ session }: { session: PublicSessionData }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => getUnreadNotificationCountFn(),
    refetchInterval: 60_000,
  })
  const hasUnread = unreadCount > 0

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div className="fixed bottom-5 left-5 z-40 flex flex-col items-center gap-3">
      {/* Notifications — heartbeat pulse + red dot while unread, quiet otherwise */}
      <rootRouteApi.Link
        search={(prev) => ({ ...prev, notifications: true })}
        className="relative w-11 h-11 rounded-[var(--r-pill)] bg-surface border border-border shadow-sm flex items-center justify-center text-text-s hover:text-accent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] cursor-pointer"
        aria-label="Notifications"
      >
        <motion.span
          animate={hasUnread ? { scale: [1, 1.18, 1] } : { scale: 1 }}
          transition={hasUnread ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
          className={hasUnread ? 'text-accent' : undefined}
        >
          <Heart className="w-5 h-5" fill={hasUnread ? 'currentColor' : 'none'} />
        </motion.span>
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-danger border-2 border-bg" />
        )}
      </rootRouteApi.Link>

      {/* More menu — dashboard / publish / logout */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="relative w-11 h-11 rounded-[var(--r-pill)] bg-surface border border-border shadow-sm flex items-center justify-center text-text-s hover:text-text transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          aria-label="More"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center">
              <motion.span
                animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute w-3 h-3 rounded-full bg-accent"
              />
              <span className="relative w-3 h-3 rounded-full bg-danger border-2 border-bg" />
            </span>
          )}
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 mb-2 w-48 bg-surface border border-border rounded-lg shadow-md py-2 overflow-hidden"
            >
              <Link
                to="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <LayoutDashboard className="w-4 h-4 text-text-s" /> Dashboard
              </Link>
              <Link
                to="/create"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <PenSquare className="w-4 h-4 text-text-s" /> Publish
              </Link>
              <Link
                to="/my-posts"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <FileStack className="w-4 h-4 text-text-s" /> My Posts
              </Link>
              <Link
                to="/saved"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <Bookmark className="w-4 h-4 text-text-s" /> Saved
              </Link>
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <Settings className="w-4 h-4 text-text-s" /> Settings
              </Link>
              <div className="my-1 border-t border-border" />
              <a
                href="/api/auth/logout"
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-danger hover:text-white hover:bg-danger transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <LogOut className="w-4 h-4" /> Log out
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Account avatar — routes to the viewer's own profile */}
      <Link
        to={session.nickname ? '/profile/$nickname' : '/onboarding'}
        params={session.nickname ? { nickname: session.nickname } : undefined}
        className="w-11 h-11 rounded-[var(--r-pill)] flex items-center justify-center text-sm font-bold text-bg bg-text-h shadow-sm hover:scale-105 transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
        aria-label="Your profile"
        title={session.name}
      >
        {session.name.charAt(0).toUpperCase()}
      </Link>
    </div>
  )
}
