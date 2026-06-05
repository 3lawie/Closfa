import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSession } from '@/server/auth/session'
import { LoginButton } from '@/components/auth'

// If already logged in, redirect to home
export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const session = await getSession()
    if (session) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <h1 className="text-4xl font-black tracking-tight text-amber-500">Closfa.</h1>
        <p className="text-gray-500 text-sm">Sign in to continue.</p>
        <LoginButton label="Log in to Closfa" className="w-full justify-center" />
        <p className="text-xs text-gray-400">
          By logging in you agree to our terms of service.
        </p>
      </div>
    </main>
  )
}
