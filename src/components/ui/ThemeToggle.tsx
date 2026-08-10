import { useSyncExternalStore } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * The `dark` class on <html> is the single source of truth for the theme, and
 * the blocking inline script in __root.tsx has already applied it (from
 * localStorage, falling back to prefers-color-scheme) before React hydrates.
 *
 * So this component reads that class rather than recomputing the same decision
 * in an effect and calling setState — which is what it used to do, producing an
 * extra render on mount and a second, silently divergent copy of the
 * theme-resolution logic.
 */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

function isDarkNow(): boolean {
  return document.documentElement.classList.contains('dark')
}

function setTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('theme', dark ? 'dark' : 'light')
  for (const l of listeners) l()
}

export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  // Server snapshot is false; the inline script means the real class is already
  // correct in the DOM, so no flash — only the icon settles on hydration.
  const isDark = useSyncExternalStore(subscribe, isDarkNow, () => false)

  return (
    <button
      onClick={() => setTheme(!isDark)}
      aria-pressed={isDark}
      className={cn(
        "flex items-center justify-center transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-surface text-text-s",
        iconOnly
          ? "w-10 h-10 rounded-[var(--r-pill)]"
          : "gap-4 px-4 py-3 rounded-lg font-semibold w-full text-left"
      )}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
      {!iconOnly && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
    </button>
  )
}
