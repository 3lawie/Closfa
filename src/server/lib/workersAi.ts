// Cloudflare Workers AI — reached via the ambient `cloudflare:workers` module
// (`env`), not through any TanStack Start-provided context. Confirmed by
// direct research: createServerFn handlers have no path to the raw
// ExecutionContext/env that Cloudflare's runtime passes to fetch(), but
// `cloudflare:workers` exposes `env`/`waitUntil` as request-scoped ambient
// functions regardless of which framework layer is calling them — the same
// primitive `waitUntil` (used in post.service.ts's background job) comes from.
import { env } from 'cloudflare:workers'
import { logger } from './logger'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Spreading a large Uint8Array straight into String.fromCharCode(...bytes)
  // blows the call stack on anything but a small file — chunking avoids that
  // without needing Node's Buffer (unavailable on this edge runtime).
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/**
 * Transcribes a video/audio file already hosted on ImageKit. Returns null
 * (never throws) on any failure — this always runs as best-effort background
 * work (see post.service.ts), never something a user-facing call waits on.
 *
 * Not yet verified against a real upload: Cloudflare's docs describe this
 * model's `audio` input as base64-encoded audio bytes, but whether it
 * transparently extracts audio from a video container (mp4/webm) the way
 * some hosted ASR APIs do, or requires an audio-only format first, isn't
 * confirmed — worth checking with a real video post once this is deployed.
 */
export async function transcribeMedia(mediaUrl: string): Promise<string | null> {
  try {
    const res = await fetch(mediaUrl)
    if (!res.ok) {
      logger.warn('transcribeMedia: fetch failed', { mediaUrl, status: res.status })
      return null
    }
    const buffer = await res.arrayBuffer()
    const audio = arrayBufferToBase64(buffer)

    const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio })
    const text = result.text?.trim()
    return text && text.length > 0 ? text : null
  } catch (e) {
    logger.error('transcribeMedia failed', { mediaUrl }, e instanceof Error ? e : undefined)
    return null
  }
}

export type ModerationResult = { flagged: boolean; reason: string | null }

/**
 * Moderation-only pass for text-only posts (no video/audio, so no transcript
 * and no keyword/category call — see analyzeTranscriptWithAI for that
 * combined path). Deliberately minimal prompt/output: this exists purely to
 * cover the "scan text too, not just transcripts" requirement cheaply.
 */
export async function moderateTextWithAI(text: string): Promise<ModerationResult | null> {
  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        {
          role: 'system',
          content:
            'You moderate a social media post\'s text. Flag it only if it contains hate speech, harassment, ' +
            'sexual content involving minors, or credible violent threats — ordinary strong language or ' +
            'controversial opinions are NOT flaggable. Respond with strict JSON matching the schema, nothing else.',
        },
        { role: 'user', content: text.slice(0, 2000) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            flagged: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['flagged'],
        },
      },
    })

    const raw = result.response
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ModerationResult>
    return {
      flagged: parsed.flagged === true,
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
    }
  } catch (e) {
    logger.error('moderateTextWithAI failed', undefined, e instanceof Error ? e : undefined)
    return null
  }
}

export type PostAiAnalysis = {
  keywords: string[]
  category: string | null
  flagged: boolean
  flagReason: string | null
}

/**
 * One combined Llama call for the transcript case (messier, spoken-word
 * text) — keywords, a category pick from the existing allowed list, and a
 * moderation flag, in a single request rather than three, since they're all
 * cheap once you're already paying for one call's latency. Returns null
 * (never throws) on failure; callers should fall back to RAKE-only keywords
 * with no category change and no moderation flag.
 */
export async function analyzeTranscriptWithAI(
  transcript: string,
  allowedCategories: string[],
): Promise<PostAiAnalysis | null> {
  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        {
          role: 'system',
          content:
            'You analyze a spoken video/audio transcript for a social media post. ' +
            'Extract 5-10 short topical keywords or phrases (ignore filler words and disfluencies). ' +
            `Pick the single best-fitting category from this exact list: ${allowedCategories.join(', ')}. ` +
            'Flag the content only if it contains hate speech, harassment, sexual content involving minors, ' +
            'or credible violent threats — ordinary strong language or controversial opinions are NOT flaggable. ' +
            'Respond with strict JSON matching the schema, nothing else.',
        },
        { role: 'user', content: transcript.slice(0, 4000) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            keywords: { type: 'array', items: { type: 'string' } },
            category: { type: 'string' },
            flagged: { type: 'boolean' },
            flagReason: { type: 'string' },
          },
          required: ['keywords', 'category', 'flagged'],
        },
      },
    })

    const raw = result.response
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PostAiAnalysis>
    if (!Array.isArray(parsed.keywords)) return null

    return {
      keywords: parsed.keywords.filter((k): k is string => typeof k === 'string').slice(0, 10),
      category: typeof parsed.category === 'string' && allowedCategories.includes(parsed.category) ? parsed.category : null,
      flagged: parsed.flagged === true,
      flagReason: typeof parsed.flagReason === 'string' ? parsed.flagReason : null,
    }
  } catch (e) {
    logger.error('analyzeTranscriptWithAI failed', undefined, e instanceof Error ? e : undefined)
    return null
  }
}
