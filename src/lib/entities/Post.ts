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

import { z } from "zod"


export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'] as const
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const
export const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'] as const
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES] as const


export const Media = z.object({
  mediaUrl: z.string().min(1, "Media URL is required"),
  mediaType: z.enum(["image", "video", "audio"]),
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.enum(ALLOWED_MEDIA_TYPES, { error: 'Unsupported media type' }),
  fileSize: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  category: z.array(z.string()).optional(),
})

export type Media = z.infer<typeof Media>

export const PostAuthor = z.object({
  userId: z.string(),
  name: z.string(),
  nickname: z.string(),
  profile: z.object({
    isVerified: z.boolean(),
    avatar: z.string().nullable(),
    followers: z.number().optional(),
    following: z.number().optional()
  }).nullable()
})

export type PostAuthor = z.infer<typeof PostAuthor>


export const Post = z.object({
  postId: z.string(),
  content: z.string().nullable(),
  author: PostAuthor.nullable(),
  postCategory: z.array(z.string()),
  postType: z.enum(['solo', 'collab']),
  publishedAt: z.date().nullable(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  views: z.number(),
  media: z.array(Media),
})

export type Post = z.infer<typeof Post>

export const feedPage = z.object({
  posts: z.array(Post),
  nextCursor: z.string().nullable(),
  previousCursor: z.string().nullable().optional(),
  nextPage: z.number().nullable().optional(),
})

export type FeedPage = z.infer<typeof feedPage>

export const BaseComment = z.object({
  authorId: z.string("comment author ID is required"),
  postId: z.string().min(1, 'Post ID is required'),
  comment: z.string().min(1, 'Comment cannot be empty').max(2000, 'Comment is too long'),
  type: z.enum(['text', 'sticker'], { error: 'comment type is required' }),
  createdAt: z.date().optional(),
  commentLikes: z.number().optional(),
  commentReplyCount: z.number().optional(),
  isEdited: z.boolean().default(false),
})

export const comment = z.object({
  origionComment: BaseComment,
  SubComments: z.array(z.object({
    parentId: z.string(),
    childCommentId: z.string(),
    replyingtoId: z.string(),
  })).optional()
})

export type Comment = z.infer<typeof comment>

export const action = z.object({
  doneBy: z.string("like author ID is required"),
  postId: z.string("like post ID is required"),
})

export type Action = z.infer<typeof action>

export const likesAction = action

export const sharesAction = action

export const viewsAction = action

export type LikesAction = z.infer<typeof likesAction>

export type SharesAction = z.infer<typeof sharesAction>

export type ViewsAction = z.infer<typeof viewsAction>




