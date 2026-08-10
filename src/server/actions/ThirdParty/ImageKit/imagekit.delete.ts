// ──────────────────────────────────────────────────────────────
// ImageKit asset deletion — used when a post is hard-purged.
//
// WHY this exists: purging a post used to delete only its database rows. The
// uploaded files stayed in ImageKit forever, which is both a storage leak and
// a privacy problem — anyone who had the CDN URL could still fetch the image
// of a post its author had deleted.
//
// WHY it resolves fileIds at delete time instead of storing them: ImageKit's
// delete API keys off `fileId`, but the upload path only ever persisted
// `filePath` (see create.tsx / EditProfileModal.tsx — the SDK returns both and
// we discarded the id). Storing `fileId` on the media row would be the robust
// fix and is the recommended follow-up, but it needs a schema migration, and
// it would do nothing for the media already uploaded. Resolving by name works
// for every existing row.
//
// Everything here is best-effort and never throws. A failed CDN cleanup must
// not abort the database purge — a leaked file is recoverable, a half-purged
// post is not.
// ──────────────────────────────────────────────────────────────

import { logger } from '@/server/lib/logger'

const API_BASE = 'https://api.imagekit.io/v1/files'

export interface DeleteAssetsResult {
  deleted: number
  /** Paths we could not resolve or delete. Logged, not thrown. */
  failed: string[]
}

function authHeader(privateKey: string): string {
  // Basic auth with the private key as the username and an empty password —
  // note the trailing colon. btoa (not Buffer) to stay edge-compatible.
  return `Basic ${btoa(`${privateKey}:`)}`
}

/**
 * Resolve a stored media path (e.g. `posts/abc_1.jpg`) to its ImageKit fileId.
 *
 * `filePath` is not a searchable field in ImageKit's query language, so this
 * scopes by folder via the `path` parameter and matches the leaf filename with
 * `name`, then confirms the returned filePath actually matches — two files of
 * the same name can exist in different folders, and `path` scoping alone has
 * bitten people when a folder is nested.
 */
async function resolveFileId(clean: string, privateKey: string): Promise<string | null> {
  const lastSlash = clean.lastIndexOf('/')
  const folder = lastSlash === -1 ? '/' : `/${clean.slice(0, lastSlash)}`
  const name = lastSlash === -1 ? clean : clean.slice(lastSlash + 1)

  const url = new URL(API_BASE)
  url.searchParams.set('path', folder)
  url.searchParams.set('searchQuery', `name="${name}"`)
  url.searchParams.set('type', 'file')
  url.searchParams.set('limit', '1')

  const res = await fetch(url, { headers: { Authorization: authHeader(privateKey) } })
  if (!res.ok) return null

  const files = (await res.json()) as Array<{ fileId?: string; filePath?: string }>
  const match = files.find((f) => f.filePath?.replace(/^\/+/, '') === clean)
  return match?.fileId ?? null
}

/**
 * Deletes the given media paths from ImageKit. Safe to call with an empty list.
 * Never throws — callers treat cleanup as advisory.
 */
export async function deleteImageKitAssets(paths: string[]): Promise<DeleteAssetsResult> {
  // Normalise before de-duplicating: media rows store paths inconsistently
  // (create.tsx strips the leading slash, older rows may not), so `a.jpg` and
  // `/a.jpg` are the same object and must not be looked up twice.
  const unique = [
    ...new Set(paths.map((p) => p.trim().replace(/^\/+/, '')).filter((p) => p !== '')),
  ]
  if (unique.length === 0) return { deleted: 0, failed: [] }

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
  if (!privateKey) {
    logger.error('ImageKit cleanup skipped: IMAGEKIT_PRIVATE_KEY is not set', {
      scope: 'imagekit.delete',
      pathCount: unique.length,
    })
    return { deleted: 0, failed: unique }
  }

  const failed: string[] = []
  const ids: string[] = []

  const resolved = await Promise.all(
    unique.map(async (path) => {
      try {
        return { path, fileId: await resolveFileId(path, privateKey) }
      } catch (e) {
        logger.error('ImageKit fileId lookup failed', { scope: 'imagekit.delete', path },
          e instanceof Error ? e : undefined)
        return { path, fileId: null }
      }
    }),
  )

  for (const r of resolved) {
    if (r.fileId) ids.push(r.fileId)
    // A path that resolves to nothing is already gone — a retried purge, or a
    // file removed by hand. Not a failure worth reporting.
    else if (r.fileId === null) failed.push(r.path)
  }

  if (ids.length === 0) return { deleted: 0, failed }

  try {
    const res = await fetch(`${API_BASE}/batch/deleteByFileIds`, {
      method: 'POST',
      headers: { Authorization: authHeader(privateKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: ids }),
    })

    // 200 = all deleted, 207 = partial. Both carry the same success array.
    if (res.status !== 200 && res.status !== 207) {
      logger.error('ImageKit bulk delete failed', {
        scope: 'imagekit.delete', status: res.status, fileCount: ids.length,
      })
      return { deleted: 0, failed: unique }
    }

    const body = (await res.json()) as { successfullyDeletedFileIds?: string[] }
    return { deleted: body.successfullyDeletedFileIds?.length ?? 0, failed }
  } catch (e) {
    logger.error('ImageKit bulk delete threw', { scope: 'imagekit.delete', fileCount: ids.length },
      e instanceof Error ? e : undefined)
    return { deleted: 0, failed: unique }
  }
}
