import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'

const SHORTCUTS: [string, string][] = [
  ['↑ / ↓', 'Focus previous / next post'],
  ['Shift + ↑ / ↓', 'Page the feed up / down'],
  ['← / →', 'Seek video/audio 3s (twice quickly = change slide)'],
  ['Space', 'Play / pause the focused video or audio'],
  ['L or K', 'Like the focused post'],
  ['C', 'Open comments'],
  ['S', 'Share'],
  ['Shift + S', 'Save'],
  ['Shift + /', 'Toggle this panel'],
]

// Small discoverability affordance for the keyboard shortcuts wired into
// FeedList/PostCard — otherwise there's no way to learn they exist.
export function KeyboardShortcutsHint() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // e.key === '?' covers US layouts; e.code === 'Slash' + shiftKey
      // covers layouts where Shift+/ doesn't actually produce "?" as the key.
      const isShiftSlash = e.key === '?' || (e.shiftKey && e.code === 'Slash')
      if (isShiftSlash) { e.preventDefault(); setOpen((v) => !v) }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Keyboard shortcuts (Shift + /)"
        aria-label="Keyboard shortcuts"
        className="hidden lg:flex fixed bottom-5 right-5 z-30 w-10 h-10 rounded-full bg-surface border border-border shadow-sm items-center justify-center text-text-s hover:text-accent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
      >
        <Keyboard className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm cursor-pointer"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
              className="fixed z-50 bottom-5 right-5 sm:bottom-8 sm:right-8 w-[calc(100vw-2.5rem)] max-w-sm bg-surface border border-border rounded-lg shadow-md p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-text-h">Keyboard shortcuts</h2>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-text-s hover:text-text">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <dl className="flex flex-col gap-2.5">
                {SHORTCUTS.map(([keys, label]) => (
                  <div key={keys} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="text-text-s">{label}</dt>
                    <dd className="font-mono text-xs font-bold text-text bg-bg border border-border rounded px-2 py-1 shrink-0">{keys}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
