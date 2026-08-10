import { useCallback, useEffect, useRef, useState } from 'react'

const RESET_MS = 2000

export interface UseCopyToClipboard {
  copied: boolean
  /** Resolves to whether the copy succeeded; never throws. */
  copy: (text: string) => Promise<boolean>
}

/**
 * Copy-to-clipboard with a self-resetting "copied" flag.
 *
 * The `execCommand` fallback isn't legacy-browser padding: `navigator.clipboard`
 * is unavailable on any non-secure origin, which includes reviewers opening a
 * preview deployment over plain http and most LAN testing on a phone.
 */
export function useCopyToClipboard(): UseCopyToClipboard {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = useCallback(async (text: string): Promise<boolean> => {
    const ok = await writeText(text)
    if (ok) {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), RESET_MS)
    }
    return ok
  }, [])

  return { copied, copy }
}

async function writeText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or non-secure context — fall through.
    }
  }

  const el = document.createElement('textarea')
  el.value = text
  // Off-screen rather than display:none — a hidden element can't be selected.
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.top = '-9999px'
  document.body.appendChild(el)
  try {
    el.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(el)
  }
}
