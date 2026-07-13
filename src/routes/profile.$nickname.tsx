import { createFileRoute } from '@tanstack/react-router'
import { getUserProfileFn } from '@/server/actions/Database/services/user.service'
import { PostCard } from '@/components/feed/PostCard'
import { EditProfileModal } from '@/components/profile/EditProfileModal'
import type { Post } from '@/lib/entities/Post'
import { followUser, unfollowUser } from '@/server/actions/Database/services/follow.service'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { clientEnv } from '@/lib/env/client-env'
import { BadgeCheck, User } from 'lucide-react'

export const Route = createFileRoute('/profile/$nickname')({
  loader: async ({ context, params }) => {
    const profileData = await getUserProfileFn({ data: { nickname: params.nickname } }).catch(() => null)
    return { session: context.session, profileData }
  },
  component: ProfilePage,
})

function ProfilePage() {
  const { session, profileData } = Route.useLoaderData()
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)

  // Hooks above this line must run on every render regardless of profileData
  // (rules-of-hooks) — the "not found" branch below returns before touching
  // any state derived from profileData itself.
  const isFollowing = !!profileData?.isFollowing
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!profileData) throw new Error('No profile loaded')
      if (isFollowing) {
        return await unfollowUser({ data: { targetUserId: profileData.user.userId } })
      } else {
        return await followUser({ data: { targetUserId: profileData.user.userId } })
      }
    },
    onSuccess: () => {
      router.invalidate() // Refresh the profile data
    }
  })

  if (!profileData) {
    return (
      <div className="w-full flex flex-col min-h-screen bg-bg">
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto w-full">
          <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center text-text mb-6 shadow-sm border border-border">
            <User className="w-12 h-12 opacity-50" />
          </div>
          <h2 className="text-2xl font-black text-text mb-2">User Not Found</h2>
          <p className="text-text-s">The user you are looking for does not exist or has been removed.</p>
        </main>
      </div>
    )
  }

  const { user, posts, stats } = profileData
  const isCurrentUser = session?.userId === user.userId

  return (
    <div className="w-full flex flex-col bg-bg">
      <main className="flex-1 w-full max-w-3xl mx-auto pb-24">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-lg p-6 sm:p-10 mb-8 mt-4 sm:mt-8 shadow-sm border border-border"
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
            <div className="shrink-0 relative">
              {user.profile?.avatarMedia ? (
                <img
                  src={`${clientEnv.imagekitUrlEndpoint}/tr:w-160,h-160,fo-face,c-at_max,f-avif/${user.profile.avatarMedia.mediaUrl}`}
                  alt={user.name}
                  className="w-32 h-32 rounded-full object-cover shadow-md border-4 border-surface bg-surface-translucent"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-accent-bg text-accent flex items-center justify-center text-4xl font-bold shadow-md border-4 border-surface">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left min-w-0">
              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between w-full gap-4 mb-4">
                <div className="flex flex-col items-center sm:items-start min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-black text-text flex items-center gap-2 truncate max-w-full">
                    {user.name}
                    {user.profile?.isVerified && (
                      <BadgeCheck className="w-6 h-6 text-brand shrink-0" />
                    )}
                  </h1>
                  <p className="text-[15px] font-medium text-text-s mt-1">@{user.nickname}</p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {session && !isCurrentUser && (
                    <Button
                      onClick={() => followMutation.mutate()}
                      isPending={followMutation.isPending}
                      variant={isFollowing ? 'secondary' : 'primary'}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </Button>
                  )}

                  {isCurrentUser && (
                    <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
                      Edit Profile
                    </Button>
                  )}
                </div>
              </div>

              {user.profile?.bio && (
                <p className="text-[15px] text-text-h leading-relaxed max-w-2xl mb-6">
                  {user.profile.bio}
                </p>
              )}

              <div className="flex items-center justify-center sm:justify-start gap-6 text-[15px] mt-auto">
                <div className="flex flex-col sm:flex-row items-center sm:gap-1.5 text-text-s">
                  <strong className="text-lg sm:text-[15px] font-bold text-text">{stats.following}</strong>
                  <span>Following</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:gap-1.5 text-text-s">
                  <strong className="text-lg sm:text-[15px] font-bold text-text">{stats.followers}</strong>
                  <span>Followers</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* User Posts */}
        <div className="flex flex-col">
          <h3 className="text-xl font-bold text-text mb-6 px-2 sm:px-0">Posts</h3>
          <div className="flex flex-col">
            {posts.length > 0 ? (
              posts.map((post: any, i: number) => (
                <motion.div
                  key={post.postId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <PostCard post={post as Post} currentUserId={session?.userId} />
                </motion.div>
              ))
            ) : (
              <div className="bg-surface rounded-lg p-12 text-center shadow-sm border border-border">
                <div className="w-16 h-16 bg-surface-translucent rounded-full flex items-center justify-center text-text-s mx-auto mb-4">
                  <User className="w-8 h-8 opacity-40" />
                </div>
                <p className="text-lg font-bold text-text mb-1">No posts yet</p>
                <p className="text-text-s">When {user.name} publishes something, it will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {isCurrentUser && (
        <EditProfileModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSaved={(newNickname) => {
            if (newNickname && newNickname !== user.nickname) {
              router.navigate({ to: '/profile/$nickname', params: { nickname: newNickname } })
            } else {
              router.invalidate()
            }
          }}
          initial={{
            name: user.name,
            nickname: user.nickname ?? '',
            bio: user.profile?.bio ?? null,
            website: user.profile?.website ?? null,
            location: user.profile?.location ?? null,
            avatarUrl: user.profile?.avatarMedia
              ? `${clientEnv.imagekitUrlEndpoint}/tr:w-160,h-160,fo-face,c-at_max,f-avif/${user.profile.avatarMedia.mediaUrl}`
              : null,
            hideEngagementCounts: user.profile?.hideEngagementCounts ?? false,
          }}
          initials={user.name.charAt(0).toUpperCase()}
        />
      )}
    </div>
  )
}
