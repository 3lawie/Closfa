export function PostCardSkeleton() {
  return (
    <div
      className="px-2 pt-5 pb-6 border-b border-border animate-pulse"
      aria-hidden
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar circle */}
          <div className="w-10 h-10 rounded-full bg-surface-translucent shrink-0" />

          <div className="flex flex-col gap-1.5">
            {/* Name + time row */}
            <div className="flex items-center gap-2">
              <div className="h-4 w-24 bg-surface-translucent rounded-md" />
              <div className="h-3 w-12 bg-surface-translucent rounded-md" />
            </div>
            {/* @nickname */}
            <div className="h-3 w-20 bg-surface-translucent rounded-md" />
          </div>
        </div>
      </div>

      {/* Content lines */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="h-4 w-full bg-surface-translucent rounded-md" />
        <div className="h-4 w-[90%] bg-surface-translucent rounded-md" />
        <div className="h-4 w-[60%] bg-surface-translucent rounded-md" />
      </div>

      {/* Media block simulation (mirrors PostCard's expected layout) */}
      <div className="h-48 w-full bg-surface-translucent rounded-lg mb-4" />

      {/* Action row */}
      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
        <div className="h-8 w-12 bg-surface-translucent rounded-full" />
        <div className="h-8 w-12 bg-surface-translucent rounded-full" />
        <div className="h-8 w-12 bg-surface-translucent rounded-full" />
        <div className="h-8 w-12 bg-surface-translucent rounded-full ml-auto" />
      </div>
    </div>
  )
}

/** 3 stacked skeletons — used on initial load */
export function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2 mt-4">
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  )
}
