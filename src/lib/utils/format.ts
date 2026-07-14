// ──────────────────────────────────────────────────────────────
// Formatting Utilities — date and number helpers
// ──────────────────────────────────────────────────────────────

/** Format a date as a relative time string: "2 hours ago", "yesterday", etc. */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 30) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}

/** Format a number with K/M suffixes: 1200 → "1.2K", 1500000 → "1.5M" */
export function formatCount(n: number | null | undefined): string {
  if (n == null) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

/** "3d 4h" style countdown to a future date — used for a post's scheduled hard-delete. */
export function formatTimeRemaining(target: Date | string): string {
  const d = typeof target === 'string' ? new Date(target) : target
  const ms = d.getTime() - Date.now()
  if (ms <= 0) return 'soon'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours < 1) return 'less than 1h'
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** Format a date as a human-readable string: "Jan 15, 2025" */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-UK', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Format file size in human-readable form: 1024 → "1.0 KB" */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(3)} GB`
}

/** Format video/audio duration in seconds to MM:SS or H:MM:SS */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}


const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A user's `name` field is whatever their auth provider sent — for some
 * connections (notably email/password) that's literally the email address,
 * which must never render as a public display name. Falls back to the
 * nickname (user-chosen, safe) and only to a fully generic label if even
 * that's missing — never anything derived from the email itself, since
 * showing even part of it (e.g. the local part) is the same leak.
 */
export function safeDisplayName(name: string | null | undefined, nickname?: string | null): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed || EMAIL_LIKE.test(trimmed)) {
    return nickname ? nickname : 'Member'
  }
  return trimmed
}

/**
 * True when a chosen nickname would itself expose the account's email —
 * either the raw local part (before the @) or the same value with the
 * common separators stripped, since "boom.41167" vs "boom41167" is the same
 * leak with extra steps. Used to reject a nickname at claim/change time
 * rather than only cleaning it up after the fact everywhere it's displayed.
 */
export function isEmailDerivedNickname(nickname: string, email: string): boolean {
  const localPart = email.split('@')[0]?.toLowerCase().replace(/[._-]/g, '') ?? ''
  const candidate = nickname.toLowerCase().replace(/[._-]/g, '')
  return localPart.length > 0 && candidate === localPart
}

export function computeResolution(width: number, height: number): 'SD' | 'HD' | 'FHD' | 'QHD' | 'UHD' {
  const shorter = Math.min(width, height)
  if (shorter >= 2160) return 'UHD'
  if (shorter >= 1440) return 'QHD'
  if (shorter >= 1080) return 'FHD'
  if (shorter >= 720) return 'HD'
  return 'SD'
}
