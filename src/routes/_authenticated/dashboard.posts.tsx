import { createFileRoute } from '@tanstack/react-router'
import { getAdminPostsFn, adminSoftDeletePostFn, adminCompleteDeletePostFn, approvePostFn } from '@/server/actions/Database/services/post.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRelativeTime, formatTimeRemaining } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { motion } from 'framer-motion'
import { FileStack } from 'lucide-react'
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

export const Route = createFileRoute('/_authenticated/dashboard/posts')({
  loader: async () => {
    const postsResult = await getAdminPostsFn().catch(
      () => ({ ok: false as const, error: 'INTERNAL_ERROR' as const, message: 'Failed to load posts' }),
    )
    return { initialPosts: postsResult.ok ? postsResult.data : null }
  },
  component: DashboardPostsPage,
})

function DashboardPostsPage() {
  const { initialPosts } = Route.useLoaderData()
  const queryClient = useQueryClient()

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

  return (
    <>
        {/* ── Post Control — every post regardless of status, so a removed
            post stays reviewable/restorable instead of vanishing forever.
            Hidden entirely (not just empty) for unauthorized viewers, same
            fail-soft "null means unauthorized" pattern the reports queue
            uses on the Overview page. ── */}
        {initialPosts !== null && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
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
                      {post.post_status === 'removed' && post.scheduledPurgeAt && (
                        <p className="text-xs text-danger mt-2">
                          Pending deletion — permanently removed in {formatTimeRemaining(post.scheduledPurgeAt)}
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
    </>
  )
}
