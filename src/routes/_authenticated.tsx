import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getSessionFn } from '@/server/lib/sessionFn'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    // We check the session on the server side
    const result = await getSessionFn()

    if (!result.session || result.status === 'expired' || result.status === 'unauthorized') {
      throw redirect({ href: '/api/auth/login' })
    }

    if (!result.session.nickname) {
      throw redirect({ href: '/onboarding' })
    }

    return { session: result.session }
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
