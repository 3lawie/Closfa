import { createFileRoute, Link } from '@tanstack/react-router'
import { getSessionFn } from '@/server/auth/session.server'
import ImageRenderer from '@/components/media/ImageRenderer'
import ImageUploader from '@/components/media/ImageUploader'
import { Navbar } from '@/components/layout/Navbar'

export const Route = createFileRoute('/')({
  loader: async () => {
    // Fetch session on the server side before rendering
    const session = await getSessionFn()
    return { session }
  },
  component: IndexPage,
})

function IndexPage() {
  const { session } = Route.useLoaderData()
  const isAuthenticated = !!session

  return (
    <main className="min-h-screen w-full bg-gray-50 pb-20">
      <Navbar session={session} />

      <div className="max-w-5xl mx-auto px-4 mt-8 text-left">
        {isAuthenticated && session && (
          <section className="mb-10 p-6 bg-white rounded-2xl shadow-sm border flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-500 border border-blue-200 shadow-sm">
              {session.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{session.name}</h2>
              <p className="text-sm text-gray-500">{session.email}</p>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-12">
          {/* Video Post 1 */}
          <article className="bg-white p-4 rounded-2xl shadow-sm border">
            <video
              src="/videos/زيارة.mp4"
              controls
              className="w-full rounded-xl bg-black max-h-[600px] object-contain"
            />
          </article>

          {/* ImageKit Post */}
          <article className="bg-white p-6 rounded-2xl shadow-sm border border-transparent flex flex-col justify-center items-center gap-2">
            <ImageRenderer />
            <Link to="/Todo">
              <button className="bg-amber-500 text-white px-4 py-2 rounded-lg mt-4">Go to Todo</button>
            </Link>
          </article>

          <footer className="mt-20 text-center text-gray-400 text-sm border-t pt-6 flex flex-col items-center gap-4">
            <div>Closfa © {new Date().getFullYear()}</div>
            <ImageUploader />
          </footer>
        </section>
      </div>
    </main>
  )
}
