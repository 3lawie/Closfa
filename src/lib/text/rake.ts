// RAKE (Rapid Automatic Keyword Extraction) — a candidate phrase is a
// maximal run of non-stopword words; each phrase is scored by summing, for
// every word in it, that word's (co-occurrence degree / frequency) ratio
// across the whole text. No ML, no dependency — deterministic and free to
// run on every post.
export const STOPWORDS: readonly string[] = [
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while', 'of', 'in', 'on', 'at',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'to', 'from', 'up', 'down', 'out', 'over', 'under', 'again', 'further',
  'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will',
  'just', 'don', 'should', 'now', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have',
  'had', 'do', 'does', 'did', 'doing', 'am', 'isn', 'aren', 'wasn', 'weren', 'would', 'could',
  'ought', 'i', 'me', 'my', 'myself', 'we', 'us', 'our', 'ours', 'ourselves', 'you', 'your',
  'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
  'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'this',
  'that', 'these', 'those', 'as', 'because', 'until', 'off', 's', 't',
  // Spoken-transcript filler/disfluency — a Whisper transcript is
  // conversational, not written prose, so these matter as much as the
  // classic function-word list above.
  'um', 'uh', 'uhh', 'umm', 'like', 'gonna', 'wanna', 'gotta', 'kinda', 'sorta',
  'know', 'what', 'actually', 'basically', 'literally', 'really', 'stuff', 'thing', 'things',
  'kind', 'sort', 'okay', 'ok', 'yeah', 'right', 'well',
] as const

const STOPSET = new Set<string>(STOPWORDS.map((w) => w.toLowerCase()))

export function extractKeywords(text: string, opts?: { maxKeywords?: number }): string[] {
  const maxKeywords = opts?.maxKeywords ?? 10
  if (!text || !text.trim()) return []

  const cleaned = text.replace(/[.,;:!?()[\]{}"']/g, ' ')
  const rawTokens = cleaned.split(/\s+/).filter(Boolean)

  const phrases: string[][] = []
  let current: string[] = []

  for (const token of rawTokens) {
    if (STOPSET.has(token.toLowerCase())) {
      if (current.length) {
        phrases.push(current)
        current = []
      }
    } else {
      current.push(token)
    }
  }
  if (current.length) phrases.push(current)

  const freq: Record<string, number> = {}
  const degree: Record<string, number> = {}

  for (const phrase of phrases) {
    const phraseLen = phrase.length
    for (const word of phrase) {
      const low = word.toLowerCase()
      freq[low] = (freq[low] ?? 0) + 1
      // Every word in a phrase "co-occurs" with the whole phrase (itself
      // included), so its degree contribution per occurrence is the full
      // phrase length, not just phraseLen - 1.
      degree[low] = (degree[low] ?? 0) + phraseLen
    }
  }

  const wordScore: Record<string, number> = {}
  for (const w in freq) {
    wordScore[w] = degree[w] / freq[w]
  }

  const phraseScores = new Map<string, number>()
  for (const phrase of phrases) {
    const phraseStr = phrase.join(' ')
    let score = 0
    for (const word of phrase) score += wordScore[word.toLowerCase()]
    // A phrase can recur verbatim (e.g. a repeated spoken aside) — keep the
    // higher of the two scores rather than double-counting or overwriting
    // with whichever occurrence happened to come last.
    const existing = phraseScores.get(phraseStr)
    if (existing === undefined || score > existing) phraseScores.set(phraseStr, score)
  }

  const sorted = [...phraseScores.entries()].sort((a, b) => b[1] - a[1])

  const result: string[] = []
  const seen = new Set<string>()
  for (const [phrase] of sorted) {
    const low = phrase.toLowerCase()
    if (seen.has(low)) continue
    seen.add(low)
    result.push(phrase)
    if (result.length >= maxKeywords) break
  }
  return result
}
