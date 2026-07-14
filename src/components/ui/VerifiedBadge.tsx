import { cn } from '@/lib/utils/cn'

// Reuses Logo.tsx's exact dual-circle motif (same var(--accent) fill, same
// two opacities) so this reads as part of the same visual family as the app
// logo, plus a small solid backing circle behind the checkmark — the two
// soft circles alone leave the checkmark's far corner over only 0.5-opacity
// fill, which loses contrast on light surfaces.
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn(className)}>
      <circle cx="9.43" cy="12.86" r="7.71" fill="var(--accent)" opacity="0.85" />
      <circle cx="15.43" cy="8.57" r="5.57" fill="var(--accent)" opacity="0.5" />
      <circle cx="12" cy="11.5" r="6.2" fill="var(--accent)" />
      <path
        d="M8.2 11.7 L10.8 14.3 L15.8 8.7"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
