import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  loader: ({ context }) => {
    // Session guaranteed non-null by _authenticated's beforeLoad — no re-fetch.
    return { session: context.session }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { session } = Route.useLoaderData()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-gray-600 mb-4">Welcome back, {session?.name}!</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 text-blue-700 rounded-lg">
              <h3 className="font-bold">Total Posts</h3>
              <p className="text-2xl mt-2">0</p>
            </div>
            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg">
              <h3 className="font-bold">Followers</h3>
              <p className="text-2xl mt-2">0</p>
            </div>
            <div className="p-4 bg-purple-50 text-purple-700 rounded-lg">
              <h3 className="font-bold">Following</h3>
              <p className="text-2xl mt-2">0</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
