import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { searchUsersByNicknameFn } from '@/server/actions/Database/services/user.service'
import { AtSign, UserX } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface MentionTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
}

// Detects "@query" immediately before the caret (query = word chars, no
// spaces) — same shape the nickname regex in searchUsersByNicknameValidation
// already accepts, so results are guaranteed to pass validation untouched.
function findMentionMatch(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor)
  const match = before.match(/(?:^|\s)@(\w{0,30})$/)
  if (!match) return null
  const query = match[1]
  return { query, start: cursor - query.length - 1 }
}

// Splits on complete "@nickname" tokens so each can be colored — a plain
// <textarea> can't style substrings, so this renders into a backdrop <div>
// sitting exactly behind an otherwise-identical but text-transparent
// textarea (see the render below). Matches the same nickname charset the
// search endpoint accepts.
function renderHighlighted(text: string) {
  const parts = text.split(/(@[a-zA-Z0-9_]{1,30})/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-mention">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

// Plain <textarea> plus an "@" mention autocomplete — typing @ followed by
// characters searches nicknames (searchUsersByNicknameFn) and picking one
// inserts "@nickname " at the right spot. Used by the post composer; the
// dropdown anchors under the textarea rather than at the exact caret
// position (tracking real caret pixel coordinates in a plain textarea needs
// a mirrored-div measurement trick — out of scope for a first pass).
export function MentionTextarea({ value, onChange, placeholder, className, rows }: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['mentionSearch', mentionQuery],
    queryFn: () => searchUsersByNicknameFn({ data: { query: mentionQuery! } }),
    enabled: !!mentionQuery,
    staleTime: 10_000,
  })

  function syncMentionState(text: string, cursor: number) {
    const match = findMentionMatch(text, cursor)
    setMentionQuery(match?.query ?? null)
    setMentionStart(match ? match.start : null)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    onChange(next)
    syncMentionState(next, e.target.selectionStart ?? next.length)
  }

  function selectMention(nickname: string) {
    const el = textareaRef.current
    if (mentionStart === null || !el) return
    const cursor = el.selectionStart ?? value.length
    const before = value.slice(0, mentionStart)
    const after = value.slice(cursor)
    const next = `${before}@${nickname} ${after}`
    onChange(next)
    setMentionQuery(null)
    setMentionStart(null)

    const nextCursor = before.length + nickname.length + 2
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const showDropdown = mentionQuery !== null

  return (
    <div className="relative">
      {/* Backdrop — renders the SAME text with @mentions colored, sitting
          exactly behind the real textarea (identical box: same className,
          padding, font). The textarea's own text is transparent so only
          this shows through; its caret stays visible via caretColor. */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={cn(className, "absolute inset-0 overflow-hidden whitespace-pre-wrap break-words pointer-events-none")}
      >
        {renderHighlighted(value)}
        {/* Preserves a trailing blank line — browsers collapse a value
            ending in "\n" to the same rendered height as one without it. */}
        {value.endsWith('\n') && '​'}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onScroll={(e) => {
          if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
        }}
        onKeyDown={(e) => {
          if (showDropdown && e.key === 'Escape') { setMentionQuery(null); setMentionStart(null) }
        }}
        onClick={(e) => syncMentionState(value, e.currentTarget.selectionStart ?? value.length)}
        placeholder={placeholder}
        rows={rows}
        className={cn(className, "relative bg-transparent text-transparent")}
        style={{ caretColor: 'var(--text)' }}
      />

      <AnimatePresence>
        {showDropdown && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full mt-1 z-30 w-64 max-h-56 overflow-y-auto custom-scrollbar bg-surface border border-border rounded-lg shadow-md py-1"
          >
            {results.map((u) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => selectMention(u.nickname ?? '')}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <span className="w-7 h-7 rounded-full bg-accent-bg text-accent flex items-center justify-center text-xs font-bold shrink-0">
                  {(u.nickname ?? u.name).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex flex-col">
                  <span className="text-sm font-semibold text-mention truncate">@{u.nickname}</span>
                  <span className="text-xs text-text-s truncate">{u.name}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {mentionQuery === '' && (
        <div className="absolute left-0 top-full mt-1 z-30 px-3 py-1.5 text-xs text-text-s bg-surface border border-border rounded-lg shadow-sm flex items-center gap-1.5">
          <AtSign size={12} />
          Keep typing a nickname…
        </div>
      )}

      {mentionQuery !== null && mentionQuery !== '' && !isFetching && results.length === 0 && (
        <div className="absolute left-0 top-full mt-1 z-30 px-3 py-1.5 text-xs text-text-s bg-surface border border-border rounded-lg shadow-sm flex items-center gap-1.5">
          <UserX size={12} />
          No users found for "@{mentionQuery}"
        </div>
      )}
    </div>
  )
}
