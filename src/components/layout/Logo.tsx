import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils/cn'

// Two overlapping soft circles in the theme accent — a small "connection /
// awareness" mark — plus the wordmark. Always routes home; this is the one
// persistent way back to the feed from any page.
export function Logo({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="Closfa — back to feed"
      className={cn("inline-flex items-center gap-2 group shrink-0", className)}
    >
      <svg width="26" height="26" viewBox="0 0 28 28" fill="none" className="shrink-0 group-hover:scale-105 transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]">
        <circle cx="11" cy="15" r="9" fill="var(--accent)" opacity="0.85" />
        <circle cx="18" cy="10" r="6.5" fill="var(--accent)" opacity="0.5" />
      </svg>
      {!iconOnly && (
        <span className="text-2xl font-black tracking-tighter text-text-h">
          Closfa
        </span>
      )}
    </Link>
  )
}
