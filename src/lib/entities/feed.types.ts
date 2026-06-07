// ──────────────────────────────────────────────────────────────
// Feed types — explicitly defined to match the Drizzle schema.
//
// WHY explicit types instead of inferring from createServerFn?
//   createServerFn wraps the handler in an RPC layer. TypeScript
//   can't always infer through this — the data property types
//   sometimes collapse to `unknown` or `any`, causing downstream
//   implicit-any errors in components.
//
//   By defining these types explicitly and matching them to the
//   Drizzle schema, we get:
//   • Full type safety in PostCard, FeedList, etc.
//   • A single source of truth that's easy to update
//   • No dependency on createServerFn's inference depth
// ──────────────────────────────────────────────────────────────

export type FeedPostMedia = {
  media_id: string
  mediaUrl: string
  media_type: 'image' | 'video' | 'audio'
  width: number | null
  height: number | null
  duration: number | null
  mimeType: string
  fileSize: number | null
}

export type FeedPostAuthor = {
  userId: string
  name: string
  nickname: string
  profile: {
    isVerified: boolean
    avatar: { mediaUrl: string } | null
  } | null
}

export type FeedPost = {
  postId: string
  content: string | null
  post_category: string
  post_type: 'solo' | 'collab'
  published_at: Date | null
  likes: number
  comments: number
  shares: number
  views: number
  primaryAuthor: FeedPostAuthor | null
  media: FeedPostMedia[]
}

export type FeedPage = {
  posts: FeedPost[]
  nextCursor: string | null
}
