// Shared by every writer of post.keywords (transcript/AI/RAKE enrichment in
// postEnrichment.ts, search-click learning in searchClickLearning.ts) so
// every source contributes rather than the last write winning — a post
// whose transcription/AI call fails still keeps whatever keywords it
// already had, and a later successful pass still adds to those instead of
// discarding them.
export function mergeKeywords(existing: string[] | null, incoming: string[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const w of [...(existing ?? []), ...incoming]) {
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(w)
  }
  return merged
}
