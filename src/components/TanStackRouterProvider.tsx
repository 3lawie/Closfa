'use client'

import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'

import { routeTree } from '@/routeTree.gen'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function TanStackRouterProvider() {
  return (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
