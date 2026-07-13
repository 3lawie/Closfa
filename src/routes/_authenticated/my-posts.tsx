import { createFileRoute, Link } from '@tanstack/react-router'
import { getMyPostsFn, resubmitPostFn, deletePost, setOwnPostVisibilityFn } from '@/server/actions/Database/services/post.service'
import { getPendingCollabInvitesFn, respondToCollabInviteFn } from '@/server/actions/Database/services/collab.service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileStack, Heart, MessageCircle, Share2, Eye, ExternalLink, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils/cn'
import { clientEnv } from '@/lib/env/client-env'
import { formatRelativeTime, formatCount } from '@/lib/utils/format'
import { toast } from '@/components/ui/Toast'

const STATUS_BADGE: Record<string, string> = {
  published: 'bg-accent-bg text-accent',
  pending: 'bg-surface-translucent text-text-s',
  draft: 'bg-surface-translucent text-text-s',
  removed: 'bg-danger-hover text-danger',
  rejected: 'bg-danger-hover text-danger',
}

type MyPost = {
  postId: string
  content: string | null
  post_status: string
  moderationReason: string | null
  likes: number
  comments: number
  shares: number
  views: number
  updatedAt: Date | string | null
  media: { media_id: string; mediaUrl: string; media_type: string }[]
}

export const Route = createFileRoute('/_authenticated/my-posts')({
  loader: async () => {
    const [posts, invites] = await Promise.all([
      getMyPostsFn().catch(() => []),
      getPendingCollabInvitesFn().catch(() => []),
    ])
    return { initialPosts: posts, initialInvites: invites }
  },
  component: MyPostsPage,
})

function CollabInviteRow({ invite, onChanged }: {
  invite: { postId: string; content: string | null; authorName: string; authorNickname: string | null; invitedAt: Date | string | null }
  onChanged: () => void
}) {
  const respondMutation = useMutation({
    mutationFn: (accept: boolean) => respondToCollabInviteFn({ data: { postId: invite.postId, accept } }),
    onSuccess: (res) => {
      if (res.ok) {
        onChanged()
        toast(res.data.accepted ? 'Collab accepted — you\'re now credited as a co-author.' : 'Invite declined.', { variant: 'success' })
      } else {
        toast(res.message, { variant: 'danger' })
      }
    },
    onError: () => toast('Failed to respond to invite', { variant: 'danger' }),
  })

  return (
    <div className="p-5 md:p-6 border-b border-border last:border-0 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-text">
          <span className="font-bold">{invite.authorName}</span>{' '}
          <span className="text-text-s">@{invite.authorNickname}</span> invited you to co-author a post
        </p>
        {invite.content && <p className="text-xs text-text-s mt-1 truncate">"{invite.content}"</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          onClick={() => respondMutation.mutate(true)}
          isPending={respondMutation.isPending && respondMutation.variables === true}
        >
          Agree
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => respondMutation.mutate(false)}
          isPending={respondMutation.isPending && respondMutation.variables === false}
        >
          Decline
        </Button>
      </div>
    </div>
  )
}

function PostRow({ post, onChanged }: { post: MyPost; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(post.content ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const resubmitMutation = useMutation({
    mutationFn: () => resubmitPostFn({ data: { postId: post.postId, content } }),
    onSuccess: (res) => {
      if (res.ok) {
        setEditing(false)
        onChanged()
        toast('Resubmitted — awaiting admin approval.', { variant: 'success' })
      } else {
        toast(res.message, { variant: 'danger' })
      }
    },
    onError: () => toast('Failed to resubmit post', { variant: 'danger' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePost({ data: { postId: post.postId } }),
    onSuccess: (res) => {
      setShowDeleteConfirm(false)
      if (res.ok) { onChanged(); toast('Post deleted.', { variant: 'success' }) }
      else toast(res.message, { variant: 'danger' })
    },
    onError: () => toast('Failed to delete post', { variant: 'danger' }),
  })

  const visibilityMutation = useMutation({
    mutationFn: (status: 'draft' | 'published') => setOwnPostVisibilityFn({ data: { postId: post.postId, status } }),
    onSuccess: (res) => {
      if (res.ok) {
        onChanged()
        toast(res.data.status === 'draft' ? 'Post set to draft.' : 'Post published.', { variant: 'success' })
      } else {
        toast(res.message, { variant: 'danger' })
      }
    },
    onError: () => toast('Failed to update visibility', { variant: 'danger' }),
  })

  const needsRevision = post.post_status === 'draft' && !!post.moderationReason
  // A plain draft with no admin reason attached is one the owner unpublished
  // themselves — freely re-publishable. One sent back for revision must go
  // through resubmit + admin approval instead (handled by needsRevision above).
  const ownDraft = post.post_status === 'draft' && !post.moderationReason
  const thumbnail = post.media[0]
  const IK = clientEnv.imagekitUrlEndpoint

  return (
    <div className="p-5 md:p-6 border-b border-border last:border-0">
      <div className="flex gap-4">
        {thumbnail && (
          <div className="w-16 h-16 rounded-md overflow-hidden bg-bg border border-border shrink-0">
            {thumbnail.media_type === 'image' ? (
              <img
                src={`${IK}/tr:w-160,h-160,c-at_max,f-avif/${thumbnail.mediaUrl}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-s text-xs font-semibold uppercase">
                {thumbnail.media_type}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <span className={cn('text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider', STATUS_BADGE[post.post_status] ?? 'bg-surface-translucent text-text-s')}>
              {post.post_status}
            </span>
            <span className="text-xs text-text-s">
              • Updated {formatRelativeTime(post.updatedAt ? new Date(post.updatedAt) : new Date())}
            </span>
          </div>

          {editing ? (
            <div className="space-y-3">
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={() => resubmitMutation.mutate()} isPending={resubmitMutation.isPending} disabled={!content.trim()}>
                  Resubmit for review
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text mb-2">
              {post.content || <span className="text-text-s italic">No text content</span>}
            </p>
          )}

          {post.moderationReason && (
            <p className={cn(
              'text-xs rounded-md p-2 mt-2 border',
              post.post_status === 'removed' ? 'text-danger bg-danger-hover/20 border-danger/30' : 'text-text-s bg-bg border-border'
            )}>
              {post.post_status === 'removed' ? 'Removed — ' : 'Admin note — '}{post.moderationReason}
            </p>
          )}

          {post.post_status === 'pending' && (
            <p className="text-xs text-text-s mt-2">Awaiting admin approval.</p>
          )}

          {post.post_status === 'published' && (
            <div className="flex items-center gap-4 mt-3 text-xs text-text-s">
              <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{formatCount(post.likes)}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{formatCount(post.comments)}</span>
              <span className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5" />{formatCount(post.shares)}</span>
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{formatCount(post.views)}</span>
            </div>
          )}

          <div className="flex items-center gap-3 mt-3">
            {needsRevision && !editing && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit and resubmit</Button>
            )}
            {post.post_status === 'published' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => visibilityMutation.mutate('draft')}
                isPending={visibilityMutation.isPending && visibilityMutation.variables === 'draft'}
              >
                Set as draft
              </Button>
            )}
            {ownDraft && (
              <Button
                size="sm"
                onClick={() => visibilityMutation.mutate('published')}
                isPending={visibilityMutation.isPending && visibilityMutation.variables === 'published'}
              >
                Publish
              </Button>
            )}
            {post.post_status === 'published' && (
              <Link
                to="/post/$postId"
                params={{ postId: post.postId }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View post
              </Link>
            )}
            {post.post_status !== 'removed' && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-text-s hover:text-white hover:bg-danger rounded-full px-2 py-1 -mx-2 -my-1 transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete this post?"
        description="This removes it from your profile and the feed."
        confirmLabel="Delete post"
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

function MyPostsPage() {
  const { initialPosts, initialInvites } = Route.useLoaderData()
  const queryClient = useQueryClient()

  const { data: posts } = useQuery({
    queryKey: ['myPosts'],
    queryFn: () => getMyPostsFn(),
    initialData: initialPosts,
  })

  const { data: invites } = useQuery({
    queryKey: ['myCollabInvites'],
    queryFn: () => getPendingCollabInvitesFn(),
    initialData: initialInvites,
  })

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['myPosts'] })
    queryClient.invalidateQueries({ queryKey: ['feed'] })
  }

  function refetchInvites() {
    queryClient.invalidateQueries({ queryKey: ['myCollabInvites'] })
    queryClient.invalidateQueries({ queryKey: ['myPosts'] })
  }

  return (
    <div className="w-full max-w-2xl mx-auto pb-24">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        <header className="px-2 md:px-0">
          <h1 className="text-3xl font-black tracking-tight text-text mb-2">My Posts</h1>
          <p className="text-text-s">
            Every post you've made, whatever its status — including anything an admin sent back or removed, and why.
          </p>
        </header>

        {invites && invites.length > 0 && (
          <div className="bg-surface rounded-lg border border-border shadow-sm">
            <header className="p-5 md:p-6 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-brand" />
              <h2 className="text-sm font-bold text-text">Collab invites</h2>
            </header>
            {invites.map((invite) => (
              <CollabInviteRow key={invite.postId} invite={invite} onChanged={refetchInvites} />
            ))}
          </div>
        )}

        <div className="bg-surface rounded-lg border border-border shadow-sm">
          {posts && posts.length > 0 ? (
            posts.map((post) => (
              <PostRow key={post.postId} post={post} onChanged={refetch} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
              <div className="w-16 h-16 rounded-lg bg-accent-bg text-accent flex items-center justify-center mb-6">
                <FileStack className="w-7 h-7" />
              </div>
              <p className="text-xl font-bold text-text mb-2">No posts yet</p>
              <p className="text-text-s max-w-sm">
                <Link to="/create" className="text-accent hover:underline">Share your first post</Link> to see it here.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
