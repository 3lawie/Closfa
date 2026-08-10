import { getRouteApi } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNotificationsFn, markAllAsReadFn, markAsReadFn } from '@/server/actions/Database/services/notification.service'
import { formatRelativeTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { useOverlay } from '@/lib/hooks/useOverlay'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart,
  MessageCircle,
  Reply,
  UserPlus,
  AtSign,
  ShieldAlert,
  Bell,
  BellOff,
  Users,
  X
} from 'lucide-react'

const routeApi = getRouteApi('__root__')

export function NotificationsDrawer() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
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
      // Explicit — AccountRail's unread badge reads a distinct query key
      // (['notifications', 'unreadCount']); don't rely on prefix-match alone.
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] })
    }
  })

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => markAsReadFn({ data: { notificationId: id } }),
    onSuccess: () => {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] })
    }
  })

  const handleClose = () => {
    navigate({
      // Drop the key entirely rather than setting it to undefined, so the
      // closed state leaves no `?notifications=` residue in the URL.
      search: ({ notifications, ...rest }) => {
        void notifications
        return rest
      },
      replace: true,
    })
  }

  // Hand-rolled drawer rather than a Modal, so it registers with the overlay
  // stack directly. backToClose is false because `?notifications=` is already a
  // router history entry. It gains Escape-to-close and a scroll lock here,
  // neither of which it had before.
  useOverlay({ isOpen, onClose: handleClose, backToClose: false })

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="w-5 h-5" />
      case 'comment': return <MessageCircle className="w-5 h-5" />
      case 'reply': return <Reply className="w-5 h-5" />
      case 'follow': return <UserPlus className="w-5 h-5" />
      case 'mention': return <AtSign className="w-5 h-5" />
      case 'moderation': return <ShieldAlert className="w-5 h-5" />
      case 'collab_invite': return <Users className="w-5 h-5" />
      default: return <Bell className="w-5 h-5" />
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop — fixed dark scrim, not the swappable bg token (see Modal.tsx). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer"
          />

          {/* Drawer panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="relative w-full max-w-md h-full bg-surface shadow-md flex flex-col border-l border-border"
          >
            <header className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-2xl font-black tracking-tight text-text">Notifications</h2>
              <div className="flex items-center gap-4">
                {notifications.some(n => !n.read) && (
                  <button
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                    className="text-sm font-semibold text-brand hover:text-brand/80 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                  >
                    Mark all as read
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-translucent text-text-s hover:text-text transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                  aria-label="Close notifications"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto flex flex-col custom-scrollbar">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "p-5 flex items-start gap-4 cursor-pointer transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] border-b border-border last:border-0 hover:bg-surface-translucent",
                      !n.read && "bg-brand/5"
                    )}
                    onClick={() => {
                      if (!n.read) markAsReadMutation.mutate(n.id)

                      if (n.type === 'follow') {
                        if (n.actor) navigate({ to: '/profile/$nickname', params: { nickname: n.actor.nickname ?? '' } })
                        return
                      }
                      if (n.type === 'moderation') {
                        navigate({ to: '/my-posts' })
                        return
                      }
                      if (n.postId) {
                        const postId = n.postId
                        const commentId = (n.type === 'comment' || n.type === 'reply') ? (n.entityId ?? undefined) : undefined
                        navigate({
                          search: (prev) => ({ ...prev, notifications: undefined, post: postId, commentId }),
                        })
                      }
                    }}>
                    <div className="w-12 h-12 shrink-0 rounded-full bg-surface flex items-center justify-center text-text shadow-sm border border-border">
                      {getNotificationIcon(n.type)}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col pt-1">
                      <p className="text-[15px] leading-snug text-text-s">
                        {n.actor && (
                          <span className="font-bold text-text mr-1">
                            {n.actor.name}
                          </span>
                        )}
                        {n.message || `interacted with your content`}
                      </p>
                      <p className="text-xs text-text-s mt-2 font-medium opacity-70">
                        {/* formatRelativeTime already normalises Date | string |
                            number | null, so the old `new Date(x ?? Date.now())`
                            wrapper was both redundant and an impure call during
                            render — a missing timestamp rendered as "just now"
                            rather than as nothing. */}
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>

                    {!n.read && (
                      <div className="w-2.5 h-2.5 rounded-full bg-brand mt-2 shrink-0 shadow-sm" />
                    )}
                  </div>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 bg-brand/10 text-brand rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <BellOff className="w-10 h-10" />
                  </div>
                  <p className="text-xl font-bold text-text mb-2">All caught up!</p>
                  <p className="text-text-s max-w-[250px]">You don't have any notifications right now.</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
