import '../index.css'
import { createRootRouteWithContext, Outlet, HeadContent, Scripts } from '@tanstack/react-router'
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
  component: RootLayout,
})

function RootLayout() {
  const { queryClient } = Route.useRouteContext()

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Closfa</title>
        <HeadContent />
      </head>
      <body className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 min-h-screen font-sans">
        <QueryClientProvider client={queryClient}>
          <ImageKitProvider urlEndpoint={clientEnv.imagekitUrlEndpoint}>
            <Outlet />
          </ImageKitProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
