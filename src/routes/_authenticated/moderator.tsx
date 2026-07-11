import { createFileRoute } from '@tanstack/react-router'
import { getPendingReportsFn } from '@/server/actions/Database/services/moderation.service'
import { Navbar } from '@/components/layout/Navbar'
import { formatRelativeTime } from '@/lib/utils/format'

export const Route = createFileRoute('/_authenticated/moderator')({
  loader: async ({ context }) => {
    // Session guaranteed non-null by _authenticated's beforeLoad
    const reports = await getPendingReportsFn()
    return { session: context.session, reports }
  },
  component: ModeratorDashboardPage,
})

function ModeratorDashboardPage() {
  const { session, reports } = Route.useLoaderData()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar session={session} />
      
      <main className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-h)' }}>Moderator Dashboard</h1>
        
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Pending Reports</h2>
          </div>
          
          <div className="divide-y" style={{ divideColor: 'var(--border)' }}>
            {reports.length > 0 ? (
              reports.map((report) => (
                <div key={report.id} className="p-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700">
                        {report.targetType.toUpperCase()}
                      </span>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-s)' }}>
                        ID: {report.targetId}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-s)' }}>
                        • Reported {formatRelativeTime(new Date(report.createdAt))}
                      </span>
                    </div>
                    
                    <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--text)' }}>Reason: {report.reason}</h3>
                    
                    {report.details && (
                      <p className="text-sm mt-2 p-3 rounded" style={{ background: 'var(--surface)', color: 'var(--text-s)' }}>
                        {report.details}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex gap-2 sm:flex-col">
                    <button className="px-3 py-1.5 text-sm font-semibold text-white bg-red-500 rounded hover:bg-red-600 transition-colors">
                      Take Action
                    </button>
                    <button className="px-3 py-1.5 text-sm font-semibold rounded border hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--text-s)' }}>
                No pending reports. Great job!
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
