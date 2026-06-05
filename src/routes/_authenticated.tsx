import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getSessionFn } from '@/server/auth/sessionFn'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    // We check the session on the server side
    const session = await getSessionFn()
    
    if (!session) {
      throw redirect({ href: '/api/auth/login' })
    }

    return { session }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <div>
      <Outlet />
    </div>
  )
}
