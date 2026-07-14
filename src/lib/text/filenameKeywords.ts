// Extracts candidate search keywords from an original upload filename (e.g.
// "يا_قائم_آل_محمد.mp3" → ["يا", "قائم", "آل", "محمد"]) — a free, instant,
// zero-cost signal that's available the moment a file is chosen, unlike
// transcription/AI keyword extraction (postEnrichment.ts) which requires a
// successful Cloudflare Workers AI round trip and only runs in the
// background after publish. Reads media.fileName specifically — the true
// original name captured client-side from the browser's File.name before
// upload (see create.tsx) — never ImageKit's own auto-appended
// uniqueness suffix on mediaUrl, so unlike an early prototype of this same
// idea tested against mediaUrl, no ImageKit-suffix-stripping is required
// for correctness. The stripping below is defense-in-depth against
// OS/camera auto-names (e.g. "IMG_2024.png") instead.

const MAX_EXT_LENGTH = 5

// `adjacentToStripped`: true once we've already stripped at least one
// trailing token in this pass — a short Latin fragment is only treated as
// noise when it's sitting directly against a token already confirmed
// random, not just because it's short (a real 3-letter word like "cat" at
// the true end of a real filename must survive on its own).
function looksLikeNoiseToken(tok: string, adjacentToStripped: boolean): boolean {
  if (tok.length === 0) return true // empty (from doubled separators) — drop
  if (tok.length > 12) return false // real words/phrases can be long; noise tokens are short
  // Non-Latin scripts (Arabic, etc.) never match this Latin-alnum check — never stripped.
  if (!/^[A-Za-z0-9]+$/.test(tok)) return false
  const hasDigit = /[0-9]/.test(tok)
  // Uppercase appearing AFTER the first character is the real signal —
  // "Zidane" (Title Case: one leading capital, rest lowercase) is an
  // ordinary real word and must NOT be flagged; "bG8628Y" (capitals
  // scattered mid-token, camelCase/random-generator style) is what
  // actually marks a token as machine-generated.
  const hasInteriorUpper = /[A-Z]/.test(tok.slice(1))
  if (hasDigit || hasInteriorUpper) return true
  // A bare 1-3 letter Latin token immediately preceding an already-stripped
  // noise token is almost always a fragment of that same generated string
  // split by a separator, not a real word.
  return adjacentToStripped && tok.length <= 3
}

/** Pure — extracts ordered, deduped candidate keywords from one filename. */
export function extractKeywordsFromFilename(fileName: string): string[] {
  if (!fileName) return []
  const withoutExt = fileName.replace(new RegExp(`\\.[a-zA-Z0-9]{2,${MAX_EXT_LENGTH}}$`), '')
  const tokens = withoutExt.split(/[_\-\s]+/).filter(Boolean)

  let end = tokens.length
  let strippedAny = false
  while (end > 0 && looksLikeNoiseToken(tokens[end - 1], strippedAny)) {
    end--
    strippedAny = true
  }

  const seen = new Set<string>()
  const words: string[] = []
  for (const w of tokens.slice(0, end)) {
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(w)
  }
  return words
}

/** Runs extractKeywordsFromFilename over several filenames and merges/dedupes the results — one post can have multiple media items. */
export function extractKeywordsFromFilenames(fileNames: string[]): string[] {
  const seen = new Set<string>()
  const words: string[] = []
  for (const name of fileNames) {
    for (const w of extractKeywordsFromFilename(name)) {
      const key = w.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      words.push(w)
    }
  }
  return words
}
