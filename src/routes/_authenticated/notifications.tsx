import { createFileRoute, Link } from '@tanstack/react-router'
import { getNotificationsFn, markAllAsReadFn, markAsReadFn } from '@/server/actions/Database/services/notification.service'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatRelativeTime } from '@/lib/utils/format'
import { Navbar } from '@/components/layout/Navbar'

export const Route = createFileRoute('/_authenticated/notifications')({
  loader: async ({ context }) => {
    // Session guaranteed non-null by _authenticated's beforeLoad
    const notifications = await getNotificationsFn()
    return { session: context.session, notifications }
  },
  component: NotificationsPage,
})

function NotificationsPage() {
  const { session, notifications } = Route.useLoaderData()
  const router = Route.useRouter()
  const queryClient = useQueryClient()

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await markAllAsReadFn()
    },
    onSuccess: () => {
      router.invalidate()
    }
  })

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await markAsReadFn({ data: { notificationId: id } })
    },
    onSuccess: () => {
      router.invalidate()
    }
  })

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like': return '❤️'
      case 'comment': return '💬'
      case 'reply': return '↪️'
      case 'follow': return '👤'
      case 'mention': return '👋'
      case 'system': return '⚙️'
      case 'moderation': return '🛡️'
      default: return '🔔'
    }
  }

  const getNotificationLink = (n: any) => {
    if (n.type === 'follow' && n.actor) {
      return `/profile/${n.actor.nickname}`
    }
    if (n.entityId) {
      return `/post/${n.entityId}`
    }
    return '#'
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar session={session} />

      <main className="max-w-[680px] mx-auto min-h-screen pb-20" style={{ borderInline: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Notifications</h1>

          {notifications.some(n => !n.read) && (
            <button
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="divide-y" style={{ divideColor: 'var(--border)' }}>
          {notifications.length > 0 ? (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 transition-colors flex gap-4 ${!n.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                onMouseEnter={() => !n.read && !markAsReadMutation.isPending && markAsReadMutation.mutate(n.id)}
              >
                <div className="text-2xl mt-1">
                  {getNotificationIcon(n.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <Link to={getNotificationLink(n)} className="block">
                    <p className="text-sm" style={{ color: 'var(--text)' }}>
                      {n.actor && (
                        <span className="font-bold mr-1" style={{ color: 'var(--text-h)' }}>
                          {n.actor.name}
                        </span>
                      )}
                      {n.message || `interacted with your content`}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-s)' }}>
                      {formatRelativeTime(new Date(n.createdAt))}
                    </p>
                  </Link>
                </div>

                {!n.read && (
                  <div className="w-2 h-2 rounded-full self-center" style={{ background: 'var(--accent)' }} />
                )}
              </div>
            ))
          ) : (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: 'var(--accent-bg)' }}>
                🔔
              </div>
              <p className="font-semibold" style={{ color: 'var(--text-h)' }}>All caught up!</p>
              <p className="text-sm" style={{ color: 'var(--text-s)' }}>You don't have any notifications right now.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
