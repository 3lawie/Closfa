import { useEffect, useRef, useState } from "react"
import z from "zod"
import { createId } from "@paralleldrive/cuid2"
import { MediaZod, ALLOWED_MEDIA_TYPES } from "@/lib/entities/Post"
import { getMediaDimensions, getMediaType } from "@/lib/utils/file"
import { saveMedia, loadAllMedias, deleteMedia } from "@/lib/utils/mediaDB"
import { calculateMosaicSpan } from "@/lib/utils/mosaic"

const MediaType = z.object({
    mediaId: z.string(),
    originalMedia: MediaZod.omit({ mediaUrl: true, category: true }),
    editedMedia: MediaZod.omit({ mediaUrl: true, category: true }).optional(),
    reader: z.string()
})

type MediaType = z.infer<typeof MediaType>
type DivRef = HTMLDivElement | null

// Hook to track grid columns based on window width for the mosaic calculation
function useGridCols() {
    const [cols, setCols] = useState(3)

    useEffect(() => {
        function updateCols() {
            if (window.innerWidth < 640) setCols(1) // mobile
            else if (window.innerWidth < 1024) setCols(2) // tablet
            else setCols(3) // desktop
        }
        updateCols()
        window.addEventListener('resize', updateCols)
        return () => window.removeEventListener('resize', updateCols)
    }, [])

    return cols
}

export function MediaContatiner() {
    const [medias, setMedias] = useState<MediaType[]>([])
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)
    const contatinerRef = useRef<DivRef>(null)
    const blobUrlsRef = useRef<string[]>([])

    const maxCols = useGridCols()

    // 1. Load saved medias from IndexedDB on mount
    useEffect(() => {
        let cancelled = false
        loadAllMedias().then(stored => {
            if (cancelled) return
            const loaded: MediaType[] = stored.map(entry => ({
                mediaId: entry.mediaId,
                ...(entry.metadata as Omit<MediaType, "reader" | "mediaId">),
                reader: URL.createObjectURL(entry.blob),
            }))
            setMedias(loaded)
        })
        return () => { cancelled = true }
    }, [])

    // 2. Keep ref in sync with current blob URLs
    useEffect(() => {
        blobUrlsRef.current = medias.map(m => m.reader)
    }, [medias])

    // 3. Revoke all blob URLs on unmount only (empty deps)
    useEffect(() => {
        return () => {
            blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
        }
    }, [])

    async function addFiles(files: FileList | File[]) {
        if (!files.length) return

        const newEntries: MediaType[] = []
        for (const file of Array.from(files)) {
            if (file.size > 12 * 1024 * 1024) {
                alert(`File ${file.name} must be less than 12MB`)
                continue
            }
            if (!ALLOWED_MEDIA_TYPES.includes(file.type as any)) {
                alert(`File type ${file.type} is not supported.`)
                continue
            }

            const mediaId = createId()
            const mediaType = getMediaType(file.type)
            const dims = await getMediaDimensions(file)

            const newMedia: MediaType = {
                mediaId,
                originalMedia: {
                    mediaId, // Added from recent schema update
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type as typeof ALLOWED_MEDIA_TYPES[number],
                    mediaType: mediaType,
                    ...dims,
                },
                editedMedia: undefined,
                reader: URL.createObjectURL(file),
            }

            // Save the raw blob + metadata to IndexedDB
            await saveMedia({
                mediaId,
                fileName: file.name, // Keep for backward compatibility, though mediaId is the key
                blob: file,
                mimeType: file.type,
                metadata: {
                    originalMedia: newMedia.originalMedia,
                    editedMedia: newMedia.editedMedia,
                },
            })
            newEntries.push(newMedia)
        }

        setMedias(prev => [...prev, ...newEntries])
    }

    async function removeMedia(media: MediaType) {
        URL.revokeObjectURL(media.reader)
        await deleteMedia(media.mediaId)
        setMedias(prev => prev.filter(val => val.mediaId !== media.mediaId))
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files) addFiles(e.target.files)
        e.target.value = "" // Reset input so same file can be selected again
    }

    function handlePaste(e: React.ClipboardEvent) {
        if (e.clipboardData.files) addFiles(e.clipboardData.files)
    }

    // --- Drag and Drop Logic ---
    const handleDragStart = (index: number) => {
        setDraggedIndex(index)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault() // Necessary to allow dropping
    }

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === targetIndex) return

        // Swap the items
        setMedias(prev => {
            const newMedias = [...prev]
            const draggedItem = newMedias[draggedIndex]
            newMedias[draggedIndex] = newMedias[targetIndex]
            newMedias[targetIndex] = draggedItem
            return newMedias
        })
        setDraggedIndex(null)
    }

    return (
        <div ref={contatinerRef} onPaste={handlePaste} className="w-full focus:outline-none" tabIndex={0}>
            <div className="relative flex justify-between items-end mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Media</h2>
                    <p className="text-sm text-gray-500">Add up to 12 files (max 12MB each)</p>
                </div>
            </div>

            {/* Add New Media Button / Dropzone (Outside the grid, at the top) */}
            {medias.length < 12 && (
                <div
                    className={`border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-blue-400 transition-colors cursor-pointer flex items-center justify-center text-gray-500 mb-4 ${medias.length === 0 ? 'h-48 flex-col' : 'h-16 flex-row gap-2'}`}
                    onClick={() => fileInput.current?.click()}
                >
                    <svg className={`${medias.length === 0 ? 'w-8 h-8 mb-2' : 'w-5 h-5'} text-gray-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm font-medium">Add Media</span>
                    <input
                        type="file"
                        multiple
                        accept={ALLOWED_MEDIA_TYPES.join(",")}
                        onChange={handleFileChange}
                        ref={fileInput}
                        className="hidden"
                    />
                </div>
            )}

            {/* Mosaic Grid */}
            {medias.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-[200px]" style={{ gridAutoFlow: 'dense' }}>
                    {medias.map((val, index) => {
                        const { colSpan, rowSpan, isTiny } = calculateMosaicSpan(
                            val.originalMedia.width,
                            val.originalMedia.height,
                            maxCols
                        )

                        return (
                            <MediaCard
                                key={val.mediaId}
                                media={val}
                                index={index}
                                removeMedia={removeMedia}
                                colSpan={colSpan}
                                rowSpan={rowSpan}
                                isTiny={isTiny}
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                            />
                        )
                    })}
                </div>
            )}
        </div>
    )
}

type MediaCardProps = {
    media: MediaType
    index: number
    removeMedia: (media: MediaType) => void
    colSpan: number
    rowSpan: number
    isTiny: boolean
    onDragStart: () => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
}

const MediaCard = ({ media, index, removeMedia, colSpan, rowSpan, isTiny, onDragStart, onDragOver, onDrop }: MediaCardProps) => {
    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            style={{
                gridColumn: `span ${colSpan}`,
                gridRow: `span ${rowSpan}`
            }}
            className={`group relative rounded-xl overflow-hidden bg-gray-100 shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing transition-transform hover:z-10
                ${isTiny ? 'ring-2 ring-blue-400 ring-offset-2 scale-95' : ''}
            `}
        >
            {/* Index Badge */}
            <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-md text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-sm">
                {index + 1}
            </div>

            {/* Delete Button */}
            <button
                className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-red-500 backdrop-blur-md text-white w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                    e.stopPropagation()
                    removeMedia(media)
                }}
                title="Remove"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            {/* Edit/Crop Button Placeholder */}
            <button
                className="absolute bottom-2 right-2 z-10 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                onClick={(e) => {
                    e.stopPropagation()
                    // enterMediaEdit(media)
                }}
            >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Edit
            </button>

            {/* Filename Overlay on hover */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs truncate drop-shadow-md">
                    {media.originalMedia.fileName}
                </p>
            </div>

            {media.originalMedia.mediaType === 'video' ? (
                <video
                    src={media.reader}
                    className={`w-full h-full ${isTiny ? 'object-contain p-4' : 'object-cover'}`}
                    controls={false}
                    muted
                />
            ) : (
                <img
                    src={media.reader}
                    alt={media.originalMedia.fileName}
                    className={`w-full h-full pointer-events-none ${isTiny ? 'object-contain p-4' : 'object-cover'}`}
                />
            )}
        </div>
    )
}
