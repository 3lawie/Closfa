// ──────────────────────────────────────────────────────────────
// ImageKit Verifier — validates uploads BEFORE auth signature is issued
//
// Called by imagekit.service.ts before generating the HMAC signature.
// If verification fails, no auth is returned → ImageKit rejects the upload.
// ──────────────────────────────────────────────────────────────

/** Max allowed file sizes in bytes */
const MAX_SIZES: Record<string, number> = {
  'image/jpeg': 10 * 1024 * 1024,   // 10 MB
  'image/png': 10 * 1024 * 1024,    // 10 MB
  'image/webp': 10 * 1024 * 1024,   // 10 MB
  'image/avif': 10 * 1024 * 1024,   // 10 MB
  'image/gif': 20 * 1024 * 1024,    // 20 MB (GIFs are larger)
  'video/mp4': 200 * 1024 * 1024,   // 200 MB
  'video/webm': 200 * 1024 * 1024,  // 200 MB
  'audio/mpeg': 50 * 1024 * 1024,   // 50 MB
  'audio/wav': 100 * 1024 * 1024,   // 100 MB
  'audio/ogg': 50 * 1024 * 1024,    // 50 MB
}

/** Allowed MIME types */
const ALLOWED_TYPES = new Set(Object.keys(MAX_SIZES))

export type FileMetadata = {
  mimeType: string
  fileSizeBytes: number
  fileName: string
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * Validate a file's type and size before issuing an ImageKit auth signature.
 * Returns { ok: true } or { ok: false, message: string }.
 */
export function verifyImageKitUpload(file: FileMetadata): VerifyResult {
  if (!ALLOWED_TYPES.has(file.mimeType)) {
    return {
      ok: false,
      message: `File type '${file.mimeType}' is not allowed. Allowed types: ${[...ALLOWED_TYPES].join(', ')}`,
    }
  }

  const maxBytes = MAX_SIZES[file.mimeType]
  if (file.fileSizeBytes > maxBytes) {
    const maxMB = Math.round(maxBytes / (1024 * 1024))
    const actualMB = (file.fileSizeBytes / (1024 * 1024)).toFixed(1)
    return {
      ok: false,
      message: `File too large (${actualMB} MB). Maximum for ${file.mimeType} is ${maxMB} MB.`,
    }
  }

  // Sanitize filename — no path traversal or special chars
  const sanitized = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (sanitized.length === 0 || sanitized.length > 255) {
    return { ok: false, message: 'Invalid file name.' }
  }

  return { ok: true }
}
