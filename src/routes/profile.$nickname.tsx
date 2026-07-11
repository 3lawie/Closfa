import { createFileRoute } from '@tanstack/react-router'
import { getUserProfileFn } from '@/server/actions/Database/services/user.service'
import { Navbar } from '@/components/layout/Navbar'
import { PostCard } from '@/components/feed/PostCard'
import type { Post } from '@/lib/entities/Post'
import { followUser, unfollowUser } from '@/server/actions/Database/services/follow.service'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/profile/$nickname')({
  loader: async ({ context, params }) => {
    const profileData = await getUserProfileFn({ data: { nickname: params.nickname } }).catch(() => null)
    return { session: context.session, profileData }
  },
  component: ProfilePage,
})

function ProfilePage() {
  const { session, profileData } = Route.useLoaderData()

  if (!profileData) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <Navbar session={session} />
        <main className="max-w-[680px] mx-auto py-12 text-center" style={{ borderInline: '1px solid var(--border)' }}>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>User Not Found</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-s)' }}>The user you are looking for does not exist.</p>
        </main>
      </div>
    )
  }

  const { user, posts, stats, isFollowing } = profileData
  const isCurrentUser = session?.userId === user.userId
  const router = useRouter()

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        return await unfollowUser({ data: { targetUserId: user.userId } })
      } else {
        return await followUser({ data: { targetUserId: user.userId } })
      }
    },
    onSuccess: () => {
      router.invalidate() // Refresh the profile data
    }
  })

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar session={session} />

      <main className="max-w-[680px] mx-auto min-h-screen pb-20" style={{ borderInline: '1px solid var(--border)' }}>
        {/* Profile Header */}
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-full flex-shrink-0 bg-gray-200 overflow-hidden">
              {user.profile?.avatarMedia ? (
                <img 
                  src={`https://ik.imagekit.io/9npwwo7fb/tr:w-160,h-160,fo-face,c-at_max,f-avif/${user.profile.avatarMedia.mediaUrl}`} 
                  alt={user.name} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                  <svg viewBox="0 0 24 24" className="w-10 h-10" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                    {user.name}
                    {user.profile?.isVerified && (
                      <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" />
                      </svg>
                    )}
                  </h1>
                  <p className="text-sm" style={{ color: 'var(--text-s)' }}>@{user.nickname}</p>
                </div>
                
                {session && !isCurrentUser && (
                  <button
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isFollowing 
                        ? "border hover:bg-red-50 hover:text-red-600 hover:border-red-200" 
                        : "bg-[var(--accent)] text-white hover:opacity-90"
                    }`}
                    style={isFollowing ? { borderColor: 'var(--border)', color: 'var(--text)' } : {}}
                  >
                    {followMutation.isPending ? '...' : isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
                
                {isCurrentUser && (
                  <button className="px-4 py-1.5 border rounded-full text-sm font-semibold hover:bg-black/5" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                    Edit Profile
                  </button>
                )}
              </div>
              
              {user.profile?.bio && (
                <p className="mt-3 text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                  {user.profile.bio}
                </p>
              )}
              
              <div className="mt-3 flex items-center gap-4 text-xs font-medium" style={{ color: 'var(--text-s)' }}>
                <span><strong style={{ color: 'var(--text)' }}>{stats.following}</strong> Following</span>
                <span><strong style={{ color: 'var(--text)' }}>{stats.followers}</strong> Followers</span>
              </div>
            </div>
          </div>
        </div>

        {/* User Posts */}
        <div className="divide-y" style={{ divideColor: 'var(--border)' }}>
          {posts.length > 0 ? (
            posts.map((post: any) => (
              <PostCard key={post.postId} post={post as Post} currentUserId={session?.userId} />
            ))
          ) : (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--text-s)' }}>
              No posts yet.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
