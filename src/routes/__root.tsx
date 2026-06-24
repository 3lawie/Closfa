import '../index.css'
import { createRootRoute, Outlet, HeadContent, Scripts } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { ImageKitProvider } from '@imagekit/react'
import { clientEnv } from '../lib/env/client-env'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { queryClient } = Route.useRouteContext() as unknown as { queryClient: QueryClient }

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
