import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // Session already decrypted once by the root route — read from context.
    const { session, sessionStatus } = context

    if (!session || sessionStatus === 'expired' || sessionStatus === 'unauthorized') {
      throw redirect({ href: '/api/auth/login' })
    }

    if (!session.nickname) {
      throw redirect({ href: '/onboarding' })
    }

    return { session }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <div>
      <Outlet/>
    </div>
  )
}
