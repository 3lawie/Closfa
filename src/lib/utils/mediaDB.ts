const DB_NAME = "closfa-media"
const DB_VERSION = 2
const STORE_NAME = "medias"

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = (event) => {
            const db = request.result
            const oldVersion = event.oldVersion

            // Migration: drop the old store keyed by fileName
            if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME)
            }

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "mediaId" })
            }
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error("IndexedDB blocked — close other tabs using this app"))
    })
}

/** Metadata captured when a file is staged (mirrors MediaContatiner's originalMedia). */
export interface StoredMediaDetails {
    media_id: string
    fileName: string
    fileSize?: number
    mimeType: string
    media_type: 'image' | 'video' | 'audio'
    width?: number
    height?: number
    duration?: number
}

/** Non-destructive edit parameters — the stored blob is always the untouched
 *  original; these are only baked into a real image at publish time (see
 *  src/lib/utils/imageEdit.ts). Percentages, resolution-independent. */
export interface MediaEditParams {
    crop: { x: number; y: number; width: number; height: number }
    brightness: number
    contrast: number
    saturation: number
}

export interface StoredMedia {
    mediaId: string
    fileName: string
    blob: Blob
    mimeType: string
    metadata: {
        originalMedia: StoredMediaDetails
        editParams?: MediaEditParams
    }
    // Video-only: filled in asynchronously by the background thumbnail
    // worker (see src/lib/media/videoThumbnail.ts) — absent until that
    // completes, and never present at all for image/audio entries.
    thumbnailBlob?: Blob
}

/** Save a media file + its metadata to IndexedDB */
export async function saveMedia(media: StoredMedia): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        tx.objectStore(STORE_NAME).put(media)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/** Load all stored media entries */
export async function loadAllMedias(): Promise<StoredMedia[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly")
        const request = tx.objectStore(STORE_NAME).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

/** Patch just the metadata of an existing entry (e.g. saving edit params)
 *  without touching its stored blob — keeps editing non-destructive. */
export async function updateMediaMetadata(mediaId: string, metadata: StoredMedia["metadata"]): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        const store = tx.objectStore(STORE_NAME)
        const getReq = store.get(mediaId)
        getReq.onsuccess = () => {
            const record = getReq.result as StoredMedia | undefined
            if (record) store.put({ ...record, metadata })
        }
        getReq.onerror = () => reject(getReq.error)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/** Patch in a generated thumbnail blob once the background worker finishes — leaves everything else untouched. */
export async function updateMediaThumbnail(mediaId: string, thumbnailBlob: Blob): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        const store = tx.objectStore(STORE_NAME)
        const getReq = store.get(mediaId)
        getReq.onsuccess = () => {
            const record = getReq.result as StoredMedia | undefined
            if (record) store.put({ ...record, thumbnailBlob })
        }
        getReq.onerror = () => reject(getReq.error)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/** Delete a media entry by mediaId (CUID) */
export async function deleteMedia(mediaId: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        tx.objectStore(STORE_NAME).delete(mediaId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/** Clear all stored media */
export async function clearAllMedias(): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        tx.objectStore(STORE_NAME).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}
