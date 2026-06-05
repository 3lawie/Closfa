import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getSession } from '@/server/auth/session'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    // We check the session on the server side
    const session = await getSession()
    
    if (!session) {
      throw redirect({ to: '/api/auth/login' })
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
