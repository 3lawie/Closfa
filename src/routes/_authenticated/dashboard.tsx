import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { getPendingReportsFn, resolveReportFn } from '@/server/actions/Database/services/moderation.service'
import { Button } from '@/components/ui/Button'
import { useMutation, useQuery } from '@tanstack/react-query'
import { formatRelativeTime } from '@/lib/utils/format'

export const Route = createFileRoute('/_authenticated/dashboard')({
  loader: async ({ context }) => {
    const userId = context.session.userId

    // Fetch user statistics directly from the database
    const [followers, following, posts] = await Promise.all([
      db.query.follow.findMany({ where: eq(schema.follow.followedId, userId) }),
      db.query.follow.findMany({ where: eq(schema.follow.followerId, userId) }),
      db.query.post.findMany({ where: eq(schema.post.primaryAuthorId, userId) }),
    ])

    // Try loading pending reports (only works if user has permissions/role, fallback to empty array)
    const reports = await getPendingReportsFn().catch(() => [])

    return {
      session: context.session,
      stats: {
        followers: followers.length,
        following: following.length,
        posts: posts.length,
      },
      initialReports: reports,
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { session, stats, initialReports } = Route.useLoaderData()

  // Use query for real-time moderator dashboard refresh
  const { data: reports = initialReports, refetch } = useQuery({
    queryKey: ['moderator', 'reports'],
    queryFn: () => getPendingReportsFn(),
    initialData: initialReports,
  })

  const resolveMutation = useMutation({
    mutationFn: async (data: { reportId: string; action: 'delete' | 'dismiss' }) => {
      await resolveReportFn({
        data: {
          reportId: data.reportId,
          action: data.action,
        },
      })
    },
    onSuccess: () => {
      refetch()
    },
    onError: () => {
      alert('Failed to resolve report')
    },
  })

  return (
    <div className="min-h-screen p-6 sm:p-8" style={{ background: 'var(--bg)' }}>
      <main className="max-w-4xl mx-auto">
        <header className="mb-8 pb-4 border-b flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--text-h)' }}>Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--text-s)' }}>
            Overview of your account activity and moderation actions.
          </p>
        </header>

        {/* ── User Stats Grid ── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="p-6 rounded-2xl shadow-sm border transition-all hover:shadow-md" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-xs tracking-wider uppercase" style={{ color: 'var(--text-s)' }}>Total Posts</h3>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--text-h)', fontFamily: 'var(--mono)' }}>{stats.posts}</p>
          </div>
          <div className="p-6 rounded-2xl shadow-sm border transition-all hover:shadow-md" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-xs tracking-wider uppercase" style={{ color: 'var(--text-s)' }}>Followers</h3>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--text-h)', fontFamily: 'var(--mono)' }}>{stats.followers}</p>
          </div>
          <div className="p-6 rounded-2xl shadow-sm border transition-all hover:shadow-md" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-xs tracking-wider uppercase" style={{ color: 'var(--text-s)' }}>Following</h3>
            <p className="text-3xl font-bold mt-2" style={{ color: 'var(--text-h)', fontFamily: 'var(--mono)' }}>{stats.following}</p>
          </div>
        </section>

        {/* ── Moderator / Action Dashboard ── */}
        {initialReports !== null && (
          <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border overflow-hidden" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <header className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-h)' }}>Moderator Control Panel</h2>
              <p className="text-xs" style={{ color: 'var(--text-s)' }}>Pending reports that require action.</p>
            </header>

            <div className="divide-y" style={{ divideColor: 'var(--border)' }}>
              {reports.length > 0 ? (
                reports.map((report) => (
                  <div key={report.id} className="p-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300">
                          {report.targetType.toUpperCase()}
                        </span>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-s)' }}>
                          ID: {report.targetId}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-s)' }}>
                          • Reported {formatRelativeTime(new Date(report.createdAt))}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--text-h)' }}>Reason: {report.reason}</h3>

                      {report.details && (
                        <p className="text-sm mt-2 p-3 rounded-lg" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
                          {report.details}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 sm:flex-col sm:w-28 flex-shrink-0">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => resolveMutation.mutate({ reportId: report.id, action: 'delete' })}
                        isPending={resolveMutation.isPending && resolveMutation.variables?.reportId === report.id && resolveMutation.variables?.action === 'delete'}
                      >
                        Delete Content
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => resolveMutation.mutate({ reportId: report.id, action: 'dismiss' })}
                        isPending={resolveMutation.isPending && resolveMutation.variables?.reportId === report.id && resolveMutation.variables?.action === 'dismiss'}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-sm" style={{ color: 'var(--text-s)' }}>
                  No pending reports. All clear! ✦
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
