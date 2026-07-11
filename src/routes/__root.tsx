import '../index.css'
import { createRootRouteWithContext, Outlet, HeadContent, Scripts, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { QueryClientProvider } from '@tanstack/react-query'
import { ImageKitProvider } from '@imagekit/react'
import { clientEnv } from '../lib/env/client-env'
import { getSession } from '@/server/lib/session'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The ONE session fetch for the whole route tree (README Rule 1). Every
  // route below reads `context.session` / `context.sessionStatus` instead of
  // calling getSession() again — child beforeLoad/loaders must not re-fetch.
  beforeLoad: async () => {
    const result = await getSession()
    return { session: result.session, sessionStatus: result.status }
  },
  validateSearch: z.object({
    post: z.string().optional(),
    notifications: z.boolean().optional(),
  }),
  component: RootLayout,
})

import { PostModal } from '@/components/feed/PostModal'
import { NotificationsDrawer } from '@/components/feed/NotificationsDrawer'

function RootLayout() {
  const { queryClient, session } = Route.useRouteContext()

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Closfa</title>
        <HeadContent />
      </head>
      <body className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 min-h-screen font-sans">
        <QueryClientProvider client={queryClient}>
          <ImageKitProvider urlEndpoint={clientEnv.imagekitUrlEndpoint}>
            {session ? (
              <div className="flex min-h-screen">
                {/* ── Left Navigation Sidebar ── */}
                <aside 
                  className="w-64 border-r hidden md:flex flex-col justify-between sticky top-0 h-screen p-6"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex flex-col gap-8">
                    <Link to="/" className="text-2xl font-black tracking-tight" style={{ color: 'var(--brand)' }}>
                      Closfa.
                    </Link>

                    <nav className="flex flex-col gap-2">
                      <Link 
                        to="/" 
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                        activeProps={{ style: { color: 'var(--accent)', background: 'var(--accent-bg)' } }}
                      >
                        <span>🏠</span> Feed
                      </Link>
                      <Link 
                        to="/create" 
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                        activeProps={{ style: { color: 'var(--accent)', background: 'var(--accent-bg)' } }}
                      >
                        <span>✍️</span> Publish
                      </Link>
                      <Link 
                        to="/dashboard" 
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                        activeProps={{ style: { color: 'var(--accent)', background: 'var(--accent-bg)' } }}
                      >
                        <span>📊</span> Dashboard
                      </Link>
                      <Link
                        search={(prev) => ({ ...prev, notifications: true })}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                        activeProps={{ style: { color: 'var(--accent)', background: 'var(--accent-bg)' } }}
                      >
                        <span>🔔</span> Notifications
                      </Link>
                    </nav>
                  </div>

                  {/* Profile/Logout anchor */}
                  <a 
                    href="/api/auth/logout" 
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ background: 'var(--accent)' }}>
                      {session.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{session.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-s)' }}>@{session.nickname}</p>
                    </div>
                  </a>
                </aside>

                {/* ── Main Content Area ── */}
                <div className="flex-1 flex flex-col min-h-screen">
                  {/* Top Bar for Mobile viewports */}
                  <header 
                    className="md:hidden h-16 border-b flex items-center justify-between px-6 sticky top-0 z-40 backdrop-blur-md"
                    style={{ background: 'var(--surface-translucent)', borderColor: 'var(--border)' }}
                  >
                    <Link to="/" className="text-xl font-black tracking-tight" style={{ color: 'var(--brand)' }}>
                      Closfa.
                    </Link>
                    <div className="flex items-center gap-4">
                      <Link search={(prev) => ({ ...prev, notifications: true })} className="cursor-pointer">🔔</Link>
                      <a href="/api/auth/logout" className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
                        {session.name.charAt(0).toUpperCase()}
                      </a>
                    </div>
                  </header>

                  <div className="flex-1">
                    <Outlet />
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-screen">
                <Outlet />
              </div>
            )}
            <PostModal />
            <NotificationsDrawer />
          </ImageKitProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
