// ──────────────────────────────────────────────────────────────
// PostCardSkeleton — shimmer placeholder while posts are loading.
// Mirrors the exact structure of PostCard so the layout
// doesn't shift when real content replaces it.
// ──────────────────────────────────────────────────────────────

export function PostCardSkeleton() {
  return (
    <div
      className="px-4 py-4 border-b"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      aria-hidden
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar circle */}
        <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />

        <div className="flex-1 pt-0.5 flex flex-col gap-2">
          {/* Name + time row */}
          <div className="flex items-center justify-between">
            <div className="skeleton h-3.5 w-28 rounded" />
            <div className="skeleton h-3 w-10 rounded" />
          </div>
          {/* @nickname */}
          <div className="skeleton h-3 w-20 rounded" />
        </div>
      </div>

      {/* Content lines */}
      <div className="mt-3 ml-[52px] flex flex-col gap-2">
        <div className="skeleton h-3.5 w-full rounded" />
        <div className="skeleton h-3.5 w-5/6 rounded" />
        <div className="skeleton h-3.5 w-4/6 rounded" />
        {/* Category pill */}
        <div className="skeleton h-5 w-16 rounded-full mt-1" />
      </div>

      {/* Image placeholder (shown on every other card to vary the layout) */}
      <div className="mt-3 ml-[52px]">
        <div className="skeleton w-full rounded-xl" style={{ height: 200 }} />
      </div>

      {/* Action row */}
      <div className="mt-3 ml-[52px] flex items-center gap-6">
        <div className="skeleton h-4 w-10 rounded" />
        <div className="skeleton h-4 w-10 rounded" />
        <div className="skeleton h-4 w-8 rounded" />
        <div className="ml-auto skeleton h-4 w-12 rounded" />
      </div>
    </div>
  )
}

/** 3 stacked skeletons — used on initial load */
export function FeedSkeleton() {
  return (
    <>
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </>
  )
}
