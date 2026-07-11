import { useSearch, useNavigate, getRouteApi } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNotificationsFn, markAllAsReadFn, markAsReadFn } from '@/server/actions/Database/services/notification.service'
import { formatRelativeTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

const routeApi = getRouteApi('__root__')

export function NotificationsDrawer() {
  const search = routeApi.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isOpen = !!search.notifications

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotificationsFn(),
    enabled: isOpen,
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: () => markAllAsReadFn(),
    onSuccess: () => {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => markAsReadFn({ data: { notificationId: id } }),
    onSuccess: () => {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const handleClose = () => {
    navigate({
      search: (prev) => ({ ...prev, notifications: undefined }),
      replace: true,
    })
  }

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

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={handleClose}
        className={cn(
          "fixed inset-0 bg-black/40 backdrop-blur-xs z-50 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Drawer panel */}
      <div 
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-md shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col border-l",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <header className="px-6 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-h)' }}>Notifications</h2>
          <div className="flex items-center gap-3">
            {notifications.some(n => !n.read) && (
              <button
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Mark all as read
              </button>
            )}
            <button 
              onClick={handleClose}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto divide-y" style={{ divideColor: 'var(--border)' }}>
          {notifications.length > 0 ? (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "p-4 transition-colors flex gap-4 cursor-pointer",
                  !n.read ? "bg-blue-50/30 dark:bg-purple-500/5" : "hover:bg-gray-50 dark:hover:bg-zinc-800/20"
                )}
                onClick={() => {
                  if (!n.read) markAsReadMutation.mutate(n.id)
                  // If it links to a post, open the post modal!
                  if (n.entityId) {
                    navigate({
                      search: (prev) => ({ ...prev, notifications: undefined, post: n.entityId }),
                    })
                  } else if (n.type === 'follow' && n.actor) {
                    // Navigate to user
                    navigate({
                      to: '/profile/$nickname',
                      params: { nickname: n.actor.nickname }
                    })
                  }
                }}
              >
                <div className="text-2xl mt-0.5">
                  {getNotificationIcon(n.type)}
                </div>

                <div className="flex-1 min-w-0">
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
                </div>

                {!n.read && (
                  <div className="w-2 h-2 rounded-full self-center" style={{ background: 'var(--accent)' }} />
                )}
              </div>
            ))
          ) : (
            <div className="py-24 flex flex-col items-center gap-3 text-center px-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: 'var(--accent-bg)' }}>
                🔔
              </div>
              <p className="font-semibold text-lg" style={{ color: 'var(--text-h)' }}>All caught up!</p>
              <p className="text-sm max-w-xs" style={{ color: 'var(--text-s)' }}>You don't have any notifications right now.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
