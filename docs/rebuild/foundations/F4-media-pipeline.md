# F4 — Media Pipeline Architecture

## Module 1: Client Acquisition & Persistence
Uploads originate in the dashboard component. The pipeline validates input against hard limits and normalizes metadata before touching IndexedDB.

**Rules:**
1. **Validation:** Reject if `file.size > 12MB` or `mimeType` is not in `ALLOWED_MEDIA_TYPES`.
2. **Metadata:** Use `getMediaDimensions()` immediately. Duration is normalized to `Math.max(1, round)`. Images get `{width, height}`; video adds `duration`.
3. **Storage:** Store the original `blob` unmodified. Mint a `CUID` for `mediaId`. The `object store` is `medias` (keyPath: `mediaId`) inside `closfa-media` (v2).

**Skeleton:**
```typescript
const addFiles = async (files: File[]) => {
  for (const file of files) {
    if (file.size > 12_000_000 || !ALLOWED_MEDIA_TYPES.includes(file.type)) continue;
    const mediaId = createId();
    const dims = getMediaDimensions(file); // { width, height, duration? }
    const previewUrl = URL.createObjectURL(file);
    await saveMedia({ mediaId, blob: file, fileName: file.name, mimeType: file.type, metadata: { originalMedia: dims } });
  }
};
```

**Schema (IndexedDB):**
```typescript
interface StoredMedia {
  mediaId: string;
  blob: Blob;
  mimeType: string;
  metadata: {
    originalMedia: StoredMediaDetails;
    editParams?: MediaEditParams;
  };
  thumbnailBlob?: Blob; // Async for video
}
```

**Answer key:** `ai:src/components/Dahsboard/MediaContatiner.tsx`, `ai:src/lib/utils/mediaDB.ts`
**Watch-out:** The parent folder is spelled `Dahsboard` and the file `MediaContatiner.tsx`. Ensure v2 migration logic drops the old `fileName`-keyed store.

## Module 2: Off-Main-Thread Processing
Heavy decoding happens via a strict Worker protocol. Because Workers lack DOM access, video frame decoding is a hybrid operation: Main thread `<video>` -> Frame -> `ImageBitmap` -> Worker.

**Patterns:**
**(a) Idle Scheduling:** Do not block the UI. Use `whenSafeToRunBackgroundWork`. On low-end devices (`isLowEnd` derived from `hardwareConcurrency`/`memory`), enforce a 4s timeout; otherwise, 2s. `onIdle` wraps `requestIdleCallback` with a `setTimeout` fallback for Safari.

**(b) Vite Worker Bundling:** Workers must be instantiated with a literal relative path string. Alias resolution (`@/`) fails at build time for `new Worker()`.

**(c) Transferable Bitmaps:** Send pixels via `postMessage(req, [bitmap])` to avoid copying.

**Skeleton:**
```typescript
// SCHEDULING (Idle)
const safe = whenSafeToRunBackgroundWork(isLowEnd ? 4000 : 2000);
if (await safe) generateVideoThumbnail(file, duration);

// WORKER INSTANTIATION (Literal Path)
const worker = new Worker(
  new URL("../../workers/thumbnail.worker.ts", import.meta.url), 
  { type: "module" }
);

// WORKER MESSAGE (Singleton pending Map, Transferable)
worker.postMessage({ id: mediaId, bitmap, maxWidth: 300, maxHeight: 300 }, [bitmap]);
```

**Audio Waveforms:** The `audioWave.worker.ts` accepts an `OffscreenCanvas` transferred via `transferControlToOffscreen`. The main thread clones small `getByteFrequencyData` snapshots per frame. Draw logic is pure functions (e.g., `drawWave`) shared by main thread fallback.

**Answer key:** `ai:src/lib/media/videoThumbnail.ts`, `ai:src/lib/media/idleScheduler.ts`, `ai:src/workers/thumbnail.worker.ts`
**Watch-out:** Manual thumbnail overrides (`manualThumbnailIds` ref) must cancel pending auto-jobs.

## Module 3: Non-Destructive Editing
Edits are parameterized, not applied to the source blob immediately. `MediaEditModal.tsx` outputs a `MediaEditParams` object containing percentages for resolution-independent operations.

**Rules:**
1. **State:** Store `editParams` inside the `metadata` object in IndexedDB via `updateMediaMetadata`.
2. **Baking:** Actual pixel manipulation via `applyImageEdit` (src/lib/utils/imageEdit.ts) occurs only during the Publish stage.
3. **Scope:** Edits currently apply only to images. Video/Audio metadata remains read-only in this pattern.

**Skeleton:**
```typescript
type MediaEditParams = {
  crop: { x: number; y: number; width: number; height: number };
  brightness: number; // %
  contrast: number;
  saturation: number;
};

const commitEdit = (mediaId: string, params: MediaEditParams) => {
  updateMediaMetadata(mediaId, { editParams: params }); // DB only
};
```

**Answer key:** `ai:src/lib/utils/imageEdit.ts`
**Watch-out:** Ensure the original blob reference is preserved; never overwrite `StoredMedia.blob` with the edited version.

## Module 4: Authenticated Uploads & Server Signing
The client holds no secrets. It requests auth tokens for a batch, bakes edits, uploads, and then writes the [F1] database row.

**Server Logic:**
The endpoint verifies `verifyImageKitUpload()` (MIME allow-list, max size, sanitize filename) before issuing credentials. Uses `[F3]` `[authMiddleware, rateLimiterMiddleWare]`.
*   **Batch Cap:** 24 items (12 media + 12 thumbnails).
*   **Crypto:** HMAC-SHA1.
    *   `token = crypto.randomUUID()`
    *   `expire = now + 2400s`
    *   `signature = HMAC-SHA1(token + expire, IMAGEKIT_PRIVATE_KEY)`
*   **Edge:** Runs on nodejs_compat (wrangler).

**Skeleton:**
```typescript
// SERVER: issueAuth
const issueAuth = () => {
  if (!verifyImageKitUpload(meta)) throw new Error("Invalid");
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 2400;
  const sig = crypto.createHmac('sha1', IMAGEKIT_PRIVATE_KEY).update(`${token}${expire}`).digest('hex');
  return { token, signature: sig, expire };
};

// CLIENT: Publish Flow (Stage 1-4)
const baked = await Promise.all(media.map(m => applyImageEdit(m))); // 1. Bake
const auths = await getImageKitAuthBatch(baked.map(extractIds));     // 2. Sign
await Promise.all(auths.map(auth => uploadFile(file, auth)));        // 3. Upload
await createPostWithMedia(postData);                                 // 4. Persist
```

**Upload Rules:**
*   **Parallelism:** Run all `ImageKit.upload()` calls in parallel.
*   **Progress:** Byte-weighted progress tracking.
*   **Failure Modes:** A failed *main file* aborts the post. A failed *thumbnail* is ignored (best-effort).

**Answer key:** `ai:src/server/actions/ThirdParty/ImageKit/imagekit.service.ts`, `ai:src/routes/_authenticated/create.tsx`
**Watch-out:** Do not expose `IMAGEKIT_PRIVATE_KEY` to the client. Security finding #2: No unauthenticated upload variants exist.

## Module 5: Read Transforms & Rendering
The database stores relative paths. The full URL is constructed at render time using `clientEnv.imagekitUrlEndpoint`.

**Patterns:**
*   **Feed ([P1]):** `PostCard`'s `ProgressiveImage` (blur → full) requests `tr:w-500,h-500,f-avif`, lazy-loaded via a two-phase `IntersectionObserver`.
*   **Lightbox:** `ImageLightbox` requests `tr:w-1600,c-at_max,f-avif` for display.
*   **AI Upscale:** `ImageLightbox` attempts `tr:e-upscale,f-avif`; on a 404 it falls back to the display URL.
*   Standalone `ImageRenderer` is a **demo** component with a hardcoded default source — it is *not* the feed renderer.

**Skeleton:**
```typescript
// ImageKit path syntax: the tr: segment comes BEFORE the file path
const buildUrl = (path: string, transforms?: string) =>
  transforms
    ? `${clientEnv.imagekitUrlEndpoint}/tr:${transforms}/${path}`
    : `${clientEnv.imagekitUrlEndpoint}/${path}`; // original, untransformed
// Example
const feedSrc = buildUrl(row.mediaUrl, 'w-500,h-500,f-avif');
const aiSrc = buildUrl(row.mediaUrl, 'e-upscale,f-avif');
```

**Answer key:** `ai:src/components/feed/PostCard.tsx` (feed `ProgressiveImage`), `ai:src/components/media/ImageLightbox.tsx`, `ai:src/components/media/ImageRenderer.tsx` (standalone demo). URL building is inline in these components — there is no shared `imageKit` util.
**Watch-out:** `ImageRenderer` ships a hardcoded demo `imageSource`; it is not wired into the feed. Whether Whisper ([F5]) can extract audio from an mp4/webm container is unverified.