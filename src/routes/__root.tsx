import '../index.css'
import { createRootRouteWithContext, Outlet, HeadContent, Scripts, useRouterState } from '@tanstack/react-router'
import { z } from 'zod'
import { QueryClientProvider } from '@tanstack/react-query'
import { ImageKitProvider } from '@imagekit/react'
import { clientEnv } from '../lib/env/client-env'
import { getSession, toPublicSession } from '@/server/lib/session'
import type { QueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The ONE session fetch for the whole route tree (README Rule 1). Every
  // route below reads `context.session` / `context.sessionStatus` instead of
  // calling getSession() again — child beforeLoad/loaders must not re-fetch.
  //
  // `context.session` only ever carries the public subset (userId/name/
  // nickname) from here down — email/sub/issuedAt/expiresAt never leave the
  // server. Anything server-side that genuinely needs the full session reads
  // it independently through a server function's own authMiddleware (see
  // middleware.ts), which is a separate, unaffected code path from this
  // router-level context.
  beforeLoad: async () => {
    const result = await getSession()
    return { session: toPublicSession(result.session), sessionStatus: result.status }
  },
  validateSearch: z.object({
    post: z.string().optional(),
    notifications: z.boolean().optional(),
  }),
  component: RootLayout,
})

import { PostModal } from '@/components/feed/PostModal'
import { NotificationsDrawer } from '@/components/feed/NotificationsDrawer'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { AccountRail } from '@/components/layout/AccountRail'
import { Logo } from '@/components/layout/Logo'
import { Toaster } from '@/components/ui/Toast'

function RootLayout() {
  const { queryClient, session } = Route.useRouteContext()
  const matches = useRouterState({ select: (s) => s.matches })
  const currentPath = matches[matches.length - 1]?.routeId || 'unknown'

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Closfa</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
        <script dangerouslySetInnerHTML={{
          __html: `
            try {
              if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (e) {}
          `
        }}/>
        <HeadContent/>
      </head>
      <body className="bg-bg text-text min-h-screen font-sans selection:bg-brand/20">
        <QueryClientProvider client={queryClient}>
          <ImageKitProvider urlEndpoint={clientEnv.imagekitUrlEndpoint}>
            {session ? (
              <div className="min-h-screen bg-bg">
                {/* ── Main Content Area ── */}
                <main className="flex flex-col min-h-screen w-full max-w-4xl mx-auto lg:px-8">
                  {/* Top Bar for Mobile viewports */}
                  <header
                    className="lg:hidden h-16 flex items-center justify-between px-6 sticky top-0 z-40 bg-surface-translucent backdrop-blur-xl border-b border-border"
                  >
                    <Logo />
                    <ThemeToggle iconOnly />
                  </header>

                  <div className="flex-1 lg:py-8 lg:px-0 px-4 py-6 pb-24 overflow-x-hidden">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentPath}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="h-full"
                      >
                        <Outlet/>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </main>

                <div className="hidden lg:flex fixed top-5 left-5 z-40 items-center gap-4">
                  <Logo />
                  <ThemeToggle iconOnly />
                </div>
                <AccountRail session={session} />
              </div>
            ) : (
              <div className="min-h-screen bg-bg flex flex-col">
                <header className="h-16 flex items-center justify-between px-6 sticky top-0 z-40 bg-surface-translucent backdrop-blur-xl border-b border-border">
                  <Logo />
                  <ThemeToggle iconOnly />
                </header>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentPath}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="flex-1 flex flex-col"
                  >
                    <Outlet/>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
            <PostModal/>
            <NotificationsDrawer/>
            <Toaster/>
          </ImageKitProvider>
        </QueryClientProvider>
        <Scripts/>
      </body>
    </html>
  )
}
