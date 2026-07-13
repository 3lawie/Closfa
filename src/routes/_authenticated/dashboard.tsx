import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/server/lib/middleware'
import { getPendingReportsFn, resolveReportFn } from '@/server/actions/Database/services/moderation.service'
import { getAdminPostsFn, adminSoftDeletePostFn, adminCompleteDeletePostFn, approvePostFn } from '@/server/actions/Database/services/post.service'
import { getMyGlobalPermissionFn, generateRoleKeyFn, getRoleKeyStatusFn } from '@/server/actions/Database/services/role.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRelativeTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { motion } from 'framer-motion'
import { PenSquare, Users, Eye, ShieldAlert, CheckCircle2, Sparkles, FileStack, KeyRound, Copy } from 'lucide-react'
import { toast } from '@/components/ui/Toast'

const POST_STATUS_BADGE: Record<string, string> = {
  published: 'bg-accent-bg text-accent',
  pending: 'bg-surface-translucent text-text-s',
  draft: 'bg-surface-translucent text-text-s',
  removed: 'bg-danger-hover text-danger',
  rejected: 'bg-danger-hover text-danger',
}
const DEFAULT_STATUS_BADGE = 'bg-surface-translucent text-text-s'

/** Reason prompt shared by "send back for revision" and "delete permanently" — both require an explanation the owner will see. */
function ModerateReasonDialog({ isOpen, onClose, onConfirm, title, description, isPending }: {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  title: string
  description: string
  isPending?: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-text-s">{description}</p>
        <Textarea
          label="Reason (shown to the post's author)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why is this post being sent back or removed?"
        />
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => { onConfirm(reason.trim()); setReason('') }}
            isPending={isPending}
            disabled={!reason.trim()}
          >
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Duplicated from permissions.ts (server-only, imports the DB proxy — must
// never land in a client component) rather than imported — this is only
// used to decide which key cards to render, not to authorize anything.
const CLIENT_GLOBAL_ROLE_LEVELS = { moderator: 1, senior_moderator: 2, admin: 3 } as const

const ROLE_KEY_ROLES = [
  { role: 'admin' as const, label: 'Admin' },
  { role: 'senior_moderator' as const, label: 'Senior Moderator' },
  { role: 'moderator' as const, label: 'Moderator' },
]

function RoleKeyCard({ role, label }: { role: 'admin' | 'senior_moderator' | 'moderator'; label: string }) {
  const [generated, setGenerated] = useState<{ id: string; code: string } | null>(null)
  const [error, setError] = useState('')

  const generateMutation = useMutation({
    mutationFn: () => generateRoleKeyFn({ data: { role } }),
    onSuccess: (res) => {
      if (res.ok) { setGenerated(res.data); setError('') }
      else setError(res.message)
    },
  })

  const statusQuery = useQuery({
    queryKey: ['roleKeyStatus', generated?.id],
    queryFn: () => getRoleKeyStatusFn({ data: { id: generated!.id } }),
    enabled: !!generated,
    refetchInterval: 10_000,
  })
  const redeemed = statusQuery.data?.ok && statusQuery.data.data.redeemed

  function handleCopy() {
    if (!generated) return
    navigator.clipboard.writeText(generated.code)
    toast('Key copied to clipboard', { variant: 'success' })
  }

  return (
    <div className="bg-bg border border-border rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-text">{label}</h3>
        {generated && (
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0',
            redeemed ? 'bg-accent-bg text-accent' : 'bg-surface-translucent text-text-s'
          )}>
            {redeemed ? 'Used' : 'Not used yet'}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={generated?.code ?? ''}
          placeholder="No key generated yet"
          className="flex-1 min-w-0 bg-surface border border-border rounded-md px-3 py-2 text-xs text-text font-mono truncate"
        />
        <Button size="sm" variant="secondary" onClick={handleCopy} disabled={!generated} className="shrink-0 px-2">
          <Copy className="w-4 h-4" />
        </Button>
      </div>
      <Button size="sm" onClick={() => generateMutation.mutate()} isPending={generateMutation.isPending} className="w-full">
        Generate {label} key
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

const getDashboardStatsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.userId
    const { queries } = await import('@/server/queries')

    // Fetch user statistics directly from the database. Same fail-soft shape
    // as the reports fetch below — a transient stats failure shouldn't crash
    // the whole dashboard route into the router's generic error boundary.
    const [followers, following, posts, weeklyReflection] = await Promise.all([
      queries.follow.getFollowers(userId).catch(() => []),
      queries.follow.getFollowing(userId).catch(() => []),
      queries.post.getIdsByAuthor(userId).catch(() => []),
      queries.post.getWeeklyReflection(userId).catch(() => ({ postsShared: 0, likesGiven: 0, likesReceived: 0 })),
    ])

    return {
      followers: followers.length,
      following: following.length,
      posts: posts.length,
      weeklyReflection,
    }
  })

export const Route = createFileRoute('/_authenticated/dashboard')({
  loader: async ({ context }) => {
    const [stats, reportsResult, postsResult] = await Promise.all([
      getDashboardStatsFn().catch(() => ({
        followers: 0, following: 0, posts: 0,
        weeklyReflection: { postsShared: 0, likesGiven: 0, likesReceived: 0 },
      })),
      getPendingReportsFn().catch(
        () => ({ ok: false as const, error: 'INTERNAL_ERROR' as const, message: 'Failed to load reports' }),
      ),
      getAdminPostsFn().catch(
        () => ({ ok: false as const, error: 'INTERNAL_ERROR' as const, message: 'Failed to load posts' }),
      ),
    ])
    const initialReports = reportsResult.ok ? reportsResult.data : null
    const initialPosts = postsResult.ok ? postsResult.data : null

    return {
      session: context.session,
      stats,
      initialReports,
      initialPosts,
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { session, stats, initialReports, initialPosts } = Route.useLoaderData()
  const queryClient = useQueryClient()

  const permQuery = useQuery({
    queryKey: ['myGlobalPermission'],
    queryFn: () => getMyGlobalPermissionFn(),
  })
  const canAssignModerator = permQuery.data?.authorized && permQuery.data.canAssignModerator
  const viewerLevel = permQuery.data?.authorized ? permQuery.data.level : 0

  // Use query for real-time moderator dashboard refresh. Only enabled once
  // the loader already proved the viewer is authorized (initialReports set)
  // — an unauthorized viewer simply never sees the panel.
  const { data: reportsResult, refetch } = useQuery({
    queryKey: ['moderator', 'reports'],
    queryFn: () => getPendingReportsFn(),
    initialData: initialReports !== null ? { ok: true as const, data: initialReports } : undefined,
    enabled: initialReports !== null,
  })
  const reports = reportsResult?.ok ? reportsResult.data : []

  const resolveMutation = useMutation({
    mutationFn: async (data: { reportId: string; action: 'delete' | 'dismiss' | 'ban_user' | 'warn_user' }) => {
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
      toast('Failed to resolve report', { variant: 'danger' })
    },
  })

  // Post control — same fail-soft "null means unauthorized, don't render"
  // pattern as the report queue above.
  const { data: postsResult, refetch: refetchPosts } = useQuery({
    queryKey: ['admin', 'posts'],
    queryFn: () => getAdminPostsFn(),
    initialData: initialPosts !== null ? { ok: true as const, data: initialPosts } : undefined,
    enabled: initialPosts !== null,
  })
  const adminPosts = postsResult?.ok ? postsResult.data : []

  const [moderateTarget, setModerateTarget] = useState<{ postId: string; mode: 'soft' | 'complete' } | null>(null)

  const softDeleteMutation = useMutation({
    mutationFn: (vars: { postId: string; reason: string }) => adminSoftDeletePostFn({ data: vars }),
    onSuccess: () => {
      refetchPosts()
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setModerateTarget(null)
      toast('Post sent back for revision.', { variant: 'success' })
    },
    onError: () => toast('Failed to send post back for revision', { variant: 'danger' }),
  })

  const completeDeleteMutation = useMutation({
    mutationFn: (vars: { postId: string; reason: string }) => adminCompleteDeletePostFn({ data: vars }),
    onSuccess: () => {
      refetchPosts()
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setModerateTarget(null)
      toast('Post deleted.', { variant: 'success' })
    },
    onError: () => toast('Failed to delete post', { variant: 'danger' }),
  })

  const approveMutation = useMutation({
    mutationFn: (postId: string) => approvePostFn({ data: { postId } }),
    onSuccess: () => {
      refetchPosts()
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      toast('Post approved and published.', { variant: 'success' })
    },
    onError: () => toast('Failed to approve post', { variant: 'danger' }),
  })

  const statCards = [
    { label: 'Total Posts', value: stats.posts, icon: PenSquare },
    { label: 'Followers', value: stats.followers, icon: Users },
    { label: 'Following', value: stats.following, icon: Eye }
  ]

  return (
    <div className="w-full max-w-4xl mx-auto pb-24">
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-10"
      >
        <header className="px-2 md:px-0">
          <h1 className="text-3xl font-black tracking-tight text-text mb-2">Dashboard</h1>
          <p className="text-text-s">
            Overview of your account activity and moderation actions.
          </p>
        </header>

        {/* ── User Stats Grid ── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2 md:px-0">
          {statCards.map((stat, i) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="bg-surface rounded-lg p-6 shadow-sm border border-border flex flex-col justify-between transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-text-s">{stat.label}</h3>
                  <Icon className="w-5 h-5 text-brand" />
                </div>
                <p className="text-4xl font-black text-text tracking-tighter">
                  {stat.value}
                </p>
              </motion.div>
            )
          })}
        </section>

        {/* ── Weekly reflection — a neutral look back, not a scoreboard ── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="px-2 md:px-0"
        >
          <div className="bg-surface rounded-lg p-6 shadow-sm border border-border">
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-5 h-5 text-brand" />
              <h2 className="text-lg font-bold text-text">This week</h2>
            </div>
            <p className="text-text-s text-sm mb-5">A quick look back, not a leaderboard.</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-black text-text">{stats.weeklyReflection.postsShared}</p>
                <p className="text-xs text-text-s mt-1">Posts shared</p>
              </div>
              <div>
                <p className="text-2xl font-black text-text">{stats.weeklyReflection.likesGiven}</p>
                <p className="text-xs text-text-s mt-1">Likes given</p>
              </div>
              <div>
                <p className="text-2xl font-black text-text">{stats.weeklyReflection.likesReceived}</p>
                <p className="text-xs text-text-s mt-1">Likes received</p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── Moderator / Action Dashboard ── */}
        {initialReports !== null && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-4 px-2 md:px-0"
          >
            <div className="bg-surface rounded-lg p-1 shadow-sm border border-border">
              <header className="p-6 md:p-8 border-b border-border">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldAlert className="w-5 h-5 text-brand" />
                  <h2 className="text-xl font-bold text-text">Moderator Control Panel</h2>
                </div>
                <p className="text-text-s ml-8">Pending reports that require action.</p>
              </header>

              <div className="flex flex-col divide-y divide-border">
                {reports.length > 0 ? (
                  reports.map((report) => (
                    <div key={report.id} className="p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-start justify-between transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-surface-translucent group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-3">
                          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-accent-bg text-accent uppercase tracking-wider">
                            {report.targetType}
                          </span>
                          <span className="text-xs text-text-s font-mono">
                            ID: {report.targetId.slice(0, 8)}...
                          </span>
                          <span className="text-xs text-text-s">
                            • Reported {formatRelativeTime(new Date(report.createdAt))}
                          </span>
                        </div>

                        <h3 className="text-[15px] font-bold text-text mb-2">
                          Reason: {report.reason}
                        </h3>

                        {report.details && (
                          <p className="text-sm bg-bg text-text-s p-3 rounded-md mt-2 border border-border">
                            {report.details}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {report.targetType === 'user' ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => resolveMutation.mutate({ reportId: report.id, action: 'ban_user' })}
                              isPending={resolveMutation.isPending && resolveMutation.variables?.reportId === report.id && resolveMutation.variables?.action === 'ban_user'}
                            >
                              Ban User
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => resolveMutation.mutate({ reportId: report.id, action: 'warn_user' })}
                              isPending={resolveMutation.isPending && resolveMutation.variables?.reportId === report.id && resolveMutation.variables?.action === 'warn_user'}
                            >
                              Warn User
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => resolveMutation.mutate({ reportId: report.id, action: 'delete' })}
                            isPending={resolveMutation.isPending && resolveMutation.variables?.reportId === report.id && resolveMutation.variables?.action === 'delete'}
                          >
                            Delete Content
                          </Button>
                        )}
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
                  <div className="p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-accent-bg text-accent flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <p className="text-text font-bold text-lg mb-1">All clear!</p>
                    <p className="text-text-s">No pending reports require your attention.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {/* ── Post Control — every post regardless of status, so a removed
            post stays reviewable/restorable instead of vanishing forever ── */}
        {initialPosts !== null && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="px-2 md:px-0"
          >
            <div className="bg-surface rounded-lg p-1 shadow-sm border border-border">
              <header className="p-6 md:p-8 border-b border-border">
                <div className="flex items-center gap-3 mb-2">
                  <FileStack className="w-5 h-5 text-brand" />
                  <h2 className="text-xl font-bold text-text">Post Control</h2>
                </div>
                <p className="text-text-s ml-8">Review queue — resubmitted posts awaiting approval, plus every post you can act on.</p>
              </header>

              <div className="flex flex-col divide-y divide-border max-h-[32rem] overflow-y-auto">
                {adminPosts.length > 0 ? (
                  adminPosts.map((post) => (
                    <div key={post.postId} className="p-5 md:p-6 flex flex-col md:flex-row gap-4 md:items-start justify-between transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-surface-translucent">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-2">
                          <span className={cn('text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider', POST_STATUS_BADGE[post.post_status] ?? DEFAULT_STATUS_BADGE)}>
                            {post.post_status}
                          </span>
                          <span className="text-xs text-text-s">
                            @{post.primaryAuthor?.nickname ?? 'unknown'}
                          </span>
                          <span className="text-xs text-text-s">
                            • Updated {formatRelativeTime(post.updatedAt ? new Date(post.updatedAt) : new Date())}
                          </span>
                        </div>
                        <p className="text-sm text-text truncate">
                          {post.content || <span className="text-text-s italic">No text content</span>}
                        </p>
                        {post.moderationReason && (
                          <p className="text-xs text-text-s bg-bg border border-border rounded-md p-2 mt-2">
                            Reason: {post.moderationReason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {post.post_status === 'pending' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => approveMutation.mutate(post.postId)}
                            isPending={approveMutation.isPending && approveMutation.variables === post.postId}
                          >
                            Approve
                          </Button>
                        )}
                        {post.post_status !== 'removed' && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setModerateTarget({ postId: post.postId, mode: 'soft' })}
                            >
                              Send back for revision
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setModerateTarget({ postId: post.postId, mode: 'complete' })}
                            >
                              Delete permanently
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center flex flex-col items-center justify-center">
                    <p className="text-text-s">No posts yet.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        <ModerateReasonDialog
          isOpen={moderateTarget?.mode === 'soft'}
          onClose={() => setModerateTarget(null)}
          onConfirm={(reason) => moderateTarget && softDeleteMutation.mutate({ postId: moderateTarget.postId, reason })}
          title="Send back for revision"
          description="The post is unpublished and set back to draft. The author can edit it and resubmit for your approval."
          isPending={softDeleteMutation.isPending}
        />
        <ModerateReasonDialog
          isOpen={moderateTarget?.mode === 'complete'}
          onClose={() => setModerateTarget(null)}
          onConfirm={(reason) => moderateTarget && completeDeleteMutation.mutate({ postId: moderateTarget.postId, reason })}
          title="Delete permanently"
          description="This is final — the post cannot be resubmitted. The reason stays visible to the author in their post history."
          isPending={completeDeleteMutation.isPending}
        />

        {/* ── Role key management — key-based hand-off for promoting someone
            to admin/senior mod/moderator, one generate block per role.
            Moderator/senior-moderator promotion also has a direct path
            (the upgrade icon on a person's posts, or Settings' user search)
            — this is the complementary "give someone a code" flow, and the
            only path at all for admin (admin promotion is deliberately
            key-only, never a direct button). ── */}
        {canAssignModerator && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="px-2 md:px-0"
          >
            <div className="bg-surface rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-3 mb-1">
                <KeyRound className="w-5 h-5 text-brand" />
                <h2 className="text-lg font-bold text-text">Role keys</h2>
              </div>
              <p className="text-text-s text-sm mb-5">Generate a one-time key to hand someone a role upgrade.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {ROLE_KEY_ROLES.filter((r) => viewerLevel > CLIENT_GLOBAL_ROLE_LEVELS[r.role]).map((r) => (
                  <RoleKeyCard key={r.role} role={r.role} label={r.label} />
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </motion.main>
    </div>
  )
}
