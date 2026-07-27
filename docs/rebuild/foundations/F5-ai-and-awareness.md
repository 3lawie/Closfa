# F5 — AI Enrichment and the Aware-Intention Model

This module defines the app's soul: it **OBSERVES** user actions to **ADAPT** the information surface, while strictly **REFUSING** to weaponize engagement. The implementation relies on a cascading keyword pipeline, privacy-preserving behavioral signals, and an edge-native AI layer—all governed by a "human-first" data contract.

## 1. OBSERVE: The Keyword Pipeline

Keywords aggregate from four sources into a `text[]` column. The invariant is **MERGE, NEVER OVERWRITE**. `mergeKeywords` performs case-insensitive deduplication while preserving the casing of the first-seen instance.

**Source 1: Filename Extraction (Immediate)**
Run by `post.service.ts` on INSERT. `extractKeywordsFromFilenames` parses the raw `media.fileName` (never the ImageKit URL). It strips extensions, splits on `[_ - whitespace]+`, and filters noise. `looksLikeNoiseToken` targets interior-uppercase IDs, digit runs, or short fragments adjacent to noise. Non-Latin scripts are preserved.

```typescript
// src/lib/text/filenameKeywords.ts
export function extractKeywordsFromFilenames(fileNames: string[]) {
  return fileNames.flatMap(name => name
    .replace(/\.[^/.]+$/, "")       // Strip extension
    .split(/[_\s-]+/)              // Delimiters
    .filter(tok => !looksLikeNoiseToken(tok)));
}
```

**Source 2: Background Enrichment (Async)**
Triggered via `waitUntil(enrichPostForSearch(postId))`.
*   **Audio/Video:** `transcribeMedia()` (Whisper) -> `analyzeTranscriptWithAI()` (Llama: keywords, category, moderation). Fallback: `extractKeywords` (RAKE) on transcript if Llama fails.
*   **Text-only:** `extractKeywords` (RAKE) + `moderateTextWithAI`.
All writes path through `mergeKeywords`. The entire `enrichPostForSearch` body is `try/caught`; AI is best-effort, RAKE is the deterministic safety net.

```typescript
// src/server/lib/postEnrichment.ts
export async function enrichPostForSearch(postId: string) {
  try {
    const transcript = mediaUrl ? await transcribeMedia(mediaUrl) : null;
    const analysis = transcript 
      ? (await analyzeTranscriptWithAI(transcript) ?? runRake(transcript))
      : runRake(content);
    await mergeKeywords(postId, analysis.keywords);
  } catch {} // Never throws
}
```

**Answer key:** ai:src/server/lib/postEnrichment.ts, ai:src/lib/text/filenameKeywords.ts, ai:src/lib/text/keywordMerge.ts
**Watch-out:** `waitUntil` is fire-and-forget; errors are swallowed silently. `looksLikeNoiseToken` must not filter non-Latin scripts.

## 2. ADAPT: Search-Click Learning & Retrieval

**Source 3: TikTok-Style Click Learning**
`logSearchClick` fires on post view. It inserts a `search_click` row, then aggregates distinct sources: `count(distinct coalesce(userId, id))`.
*   Logged-in users: Deduplicated per `userId`.
*   Anonymous: Each row counts as a distinct source.
When `CLICK_THRESHOLD` (=3) distinct sources trigger on a `(query, postId)` pair, the query terms are merged into `post.keywords`.

```typescript
// src/server/lib/searchClickLearning.ts
async function logSearchClick(query: string, postId: string, userId: string | null) {
  await db.insert(searchClick).values({ query, postId, userId });
  const sources = await db
    .select({ c: countDistinct(coalesce(searchClick.userId, searchClick.id)) })
    .from(searchClick).where(eq(searchClick.postId, postId));
  if (sources[0].c >= CLICK_THRESHOLD) 
    await mergeKeywords(postId, query.split(/\s+/));
}
```

**Retrieval Index**
The functional GIN index `closfa_post_tsvector(content, keywords)` powers search. Note that `transcript` is deliberately **excluded** from the index to prevent double-counting; its semantic value is already condensed into the `keywords` column via the pipeline above.

**Answer key:** ai:src/server/lib/searchClickLearning.ts
**Watch-out:** `CLICK_THRESHOLD=3` is a heuristic guess; requires production tuning. A single user cannot force learning.

## 3. FALLBACK: RAKE Implementation

When LLMs fail or are absent, `extractKeywords` (RAKE) provides deterministic keyword extraction.
*   **Candidates:** Maximal runs of non-stopwords.
*   **Scoring:** Word Score = Degree / Frequency. Phrase Score = Sum(member word scores).
*   **Output:** Top N (default 10).

The stopword list is **Trilingual**: English function words, spoken disfluencies ("um", "uh"), and a full Modern Standard Arabic set. Without the Arabic set, transcripts (e.g., nasheeds) often produce single, unusable phrases.

```typescript
// src/lib/text/rake.ts
export function calculateRakeScores(text: string, stopWords: Set<string>) {
  const words = text.toLowerCase().split(/\W+/).filter(w => !stopWords.has(w));
  // 1. Build phrases (maximal non-stopword runs)
  // 2. word.score = degree(word) / freq(word)
  // 3. phrase.score = sum(word.score for w in phrase)
  return phrases.sort((a, b) => b.score - a.score).slice(0, 10);
}
```

**Answer key:** ai:src/lib/text/rake.ts
**Watch-out:** RAKE requires the specific Arabic stopword set to function correctly on multilingual content.

## 4. INFRASTRUCTURE: Workers AI Integration

AI functions reside in `src/server/lib/workersAi.ts`. Handlers access the environment via `import { env } from "cloudflare:workers"` (`createServerFn` paths do not expose raw env).

**Transcription & Inference**
*   `transcribeMedia`: Fetches ImageKit file -> `arrayBuffer` -> Base64 (chunked at `0x8000` for Edge compatibility) -> `@cf/openai/whisper-large-v3-turbo`.
*   `analyzeTranscriptWithAI` / `moderateTextWithAI`: Use `@cf/meta/llama-3.1-8b-instruct-fp8`.

**Defensive Parsing**
Llama 3.1 rejects `response_format: { type: "json_object" }` (Error 5025). JSON must be requested via the system prompt and parsed defensively.

```typescript
// src/server/lib/workersAi.ts
import { env } from "cloudflare:workers";

export async function parseJsonResponse(raw: string): T | null {
  const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
  try { return JSON.parse(clean); } catch { return null; }
}

export async function transcribeMedia(url: string) {
  const buf = await fetch(url).then(r => r.arrayBuffer());
  const b64 = chunkToBase64(buf); // chunk size 0x8000
  return env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: b64 });
}
```

All three functions return `null` on failure and never throw.

**Answer key:** ai:src/server/lib/workersAi.ts
**Watch-out:** Whisper implementation is currently unverified against real video containers. Edge environments lack `Buffer`; use arrayBuffer/chunking.

## 5. REFUSE COERCION: The Aware-Intention Model

The application remembers user intent strictly to reduce friction, not to maximize retention. Data columns map to specific UX rules:

*   `hideEngagementCounts` (Profile flag): Posts display icons only (no numbers) for *everyone*, including the author. Data is not deleted; presentation is muted.
*   `mutedKeyword` (Per-user): Filters feed queries *only* for the requesting user. Global visibility is untouched.
*   `notificationPreference` (Per-user/Per-type): **Exception store**. Absence of a row implies "enabled"; a present row carries an `enabled` flag, so a row can also explicitly *re-enable*. The table stores only exceptions — never a row per user per type.
*   `moderation` / `scheduledPurgeAt`: Content is hidden only while `scheduledPurgeAt` is in the future (3-day undo window). A cron job hard-deletes after expiry.
*   `Feed Pagination`: Soft "scroll break" nudge after 15 items, not a hard block.
*   `Reflections`: Framed as "a look back," explicitly avoiding "leaderboard" mechanics.

```typescript
// Notification Preference Logic (absence = enabled; a row can also disable)
async function isNotificationEnabled(userId: string, type: string) {
  const [pref] = await db.select().from(notificationPreference)
    .where(and(eq(notificationPreference.userId, userId),
               eq(notificationPreference.type, type)));
  return pref ? pref.enabled : true; // no row → enabled; row → its flag
}
```

**Answer key:** `ai:src/server/db/schema.ts` (the awareness columns), `ai:src/server/actions/Database/services/notification.service.ts` (the opt-out/coalescing writer), `ai:src/server/actions/Database/services/mutedKeyword.service.ts`; surfaced in [P6] settings and [P4] profile.
**Watch-out:** `collab_invite`, `moderation`, and `system` notifications bypass the opt-out writer logic.