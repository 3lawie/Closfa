import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check initial state
    const isDarkStore = localStorage.getItem('theme') === 'dark'
    const isDarkOs = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDarkMode = isDarkStore || (!localStorage.getItem('theme') && isDarkOs)

    setIsDark(isDarkMode)
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newDark = !isDark
    setIsDark(newDark)
    if (newDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  return (
    <button
      onClick={toggleTheme}
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
