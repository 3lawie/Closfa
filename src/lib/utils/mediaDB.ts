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

export interface StoredMedia {
    mediaId: string
    fileName: string
    blob: Blob
    mimeType: string
    metadata: Record<string, unknown>
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
