import { useEffect, useImperativeHandle, forwardRef, useRef, useState } from "react"
import z from "zod"
import { createId } from "@paralleldrive/cuid2"
import { MediaZod, ALLOWED_MEDIA_TYPES } from "@/lib/entities/Post"
import { getMediaDimensions, getMediaType } from "@/lib/utils/file"
import { saveMedia, loadAllMedias, deleteMedia, updateMediaMetadata, clearAllMedias } from "@/lib/utils/mediaDB"
import type { MediaEditParams } from "@/lib/utils/mediaDB"
import { editFilterString } from "@/lib/utils/imageEdit"
import { cn } from "@/lib/utils/cn"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Trash2, Pencil, ChevronLeft, ChevronRight } from "lucide-react"
import { MediaEditModal } from "@/components/media/MediaEditModal"
import { toast } from "@/components/ui/Toast"

const EditParamsZod = z.object({
    crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    brightness: z.number(),
    contrast: z.number(),
    saturation: z.number(),
})

const MediaType = z.object({
    mediaId: z.string(),
    originalMedia: MediaZod.omit({ mediaUrl: true, category: true }),
    edit: EditParamsZod.optional(),
    reader: z.string()
})

type MediaType = z.infer<typeof MediaType>
type DivRef = HTMLDivElement | null

export interface MediaContainerHandle {
    clear: () => void
}

export const MediaContatiner = forwardRef<MediaContainerHandle>(function MediaContatiner(_props, ref) {
    const [medias, setMedias] = useState<MediaType[]>([])
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [editingMediaId, setEditingMediaId] = useState<string | null>(null)
    const editingMedia = medias.find(m => m.mediaId === editingMediaId) ?? null
    const fileInput = useRef<HTMLInputElement>(null)
    const contatinerRef = useRef<DivRef>(null)
    const blobUrlsRef = useRef<string[]>([])

    // 1. Load saved medias from IndexedDB on mount
    useEffect(() => {
        let cancelled = false
        loadAllMedias().then(stored => {
            if (cancelled) return
            const loaded: MediaType[] = stored.map(entry => ({
                mediaId: entry.mediaId,
                // IndexedDB's stored shape is untyped (StoredMediaDetails.mimeType
                // is a plain string); MediaType's mimeType is the zod literal
                // union — trusted boundary cast, same reasoning as addFiles()
                // below narrowing file.type the same way at capture time.
                originalMedia: entry.metadata.originalMedia as MediaType['originalMedia'],
                edit: entry.metadata.editParams,
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

    useImperativeHandle(ref, () => ({
        clear: () => {
            blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
            setMedias([])
            clearAllMedias()
        },
    }), [])

    async function addFiles(files: FileList | File[]) {
        if (!files.length) return

        const newEntries: MediaType[] = []
        for (const file of Array.from(files)) {
            if (file.size > 12 * 1024 * 1024) {
                toast(`File ${file.name} must be less than 12MB`, { variant: 'danger' })
                continue
            }
            if (!ALLOWED_MEDIA_TYPES.includes(file.type as any)) {
                toast(`File type ${file.type} is not supported.`, { variant: 'danger' })
                continue
            }

            const mediaId = createId()
            const mediaType = getMediaType(file.type)
            const dims = await getMediaDimensions(file)

            const newMedia: MediaType = {
                mediaId,
                originalMedia: {
                    media_id: mediaId,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type as typeof ALLOWED_MEDIA_TYPES[number],
                    media_type: mediaType,
                    ...dims,
                },
                reader: URL.createObjectURL(file),
            }

            // Save the raw blob + metadata to IndexedDB
            await saveMedia({
                mediaId,
                fileName: file.name,
                blob: file,
                mimeType: file.type,
                metadata: { originalMedia: newMedia.originalMedia },
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

    // Non-destructive: only the crop/adjustment params are persisted here —
    // the staged blob is untouched, so the original is never lost and
    // reopening the editor resumes from these same params. The params are
    // baked into a real image just once, at publish time (create.tsx).
    async function handleMediaEdited(media: MediaType, params: MediaEditParams) {
        await updateMediaMetadata(media.mediaId, { originalMedia: media.originalMedia, editParams: params })
        setMedias(prev => prev.map(m => m.mediaId === media.mediaId ? { ...m, edit: params } : m))
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files) addFiles(e.target.files)
        e.target.value = "" // Reset input so same file can be selected again
    }

    function handlePaste(e: React.ClipboardEvent) {
        if (e.clipboardData.files) addFiles(e.clipboardData.files)
    }

    // --- Drag and Drop Logic ---
    // Native HTML5 DnD is the source of the "doesn't always drag" complaint:
    // without effectAllowed/dropEffect set explicitly, Firefox (and some
    // Chromium builds) silently refuse the drop; without an onDragEnd reset,
    // a drag cancelled outside any card (e.g. released over the delete
    // button, or off the grid entirely) left draggedIndex stuck, breaking
    // the next attempt. moveMedia is also exposed directly so the index
    // badge's manual input works as a non-drag fallback.
    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.effectAllowed = 'move'
        setDraggedIndex(index)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault() // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move'
    }

    function moveMedia(fromIndex: number, toIndex: number) {
        setMedias(prev => {
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= prev.length) return prev
            const next = [...prev]
            const [item] = next.splice(fromIndex, 1)
            next.splice(toIndex, 0, item)
            return next
        })
    }

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === targetIndex) { setDraggedIndex(null); return }
        moveMedia(draggedIndex, targetIndex)
        setDraggedIndex(null)
    }

    const handleDragEnd = () => {
        setDraggedIndex(null)
    }

    return (
        <div ref={contatinerRef} onPaste={handlePaste} tabIndex={0} className="outline-none">
            <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col gap-1">
                    <h2 className="text-sm font-bold text-text flex items-center gap-2">
                        Media
                        <span className="bg-surface-translucent text-text-s text-[10px] px-2 py-0.5 rounded-pill border border-border">
                            {medias.length}/12
                        </span>
                    </h2>
                    <p className="text-xs text-text-s">Add up to 12 files (max 12MB each)</p>
                </div>
                {/* Add New Media Button / Dropzone (Outside the grid, at the top) */}
                {medias.length < 12 && (
                    <button
                        onClick={() => fileInput.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-accent-bg text-accent rounded-lg font-bold text-sm hover:bg-accent-hover transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add Media</span>
                        <input
                            type="file"
                            multiple
                            accept={ALLOWED_MEDIA_TYPES.join(",")}
                            onChange={handleFileChange}
                            ref={fileInput}
                            className="hidden"
                        />
                    </button>
                )}
            </div>

            {/* Uniform grid — every cell is the same size, so array order always
                matches reading order (a mosaic/dense-packed grid reflows spans
                independently of array order, which made "set position 3"
                visually land somewhere unexpected). Mobile-first: 2 columns by
                default, more on wider screens. */}
            <AnimatePresence>
                {medias.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                    >
                        {medias.map((val, index) => (
                            <MediaCard
                                key={val.mediaId}
                                media={val}
                                index={index}
                                total={medias.length}
                                isDragging={draggedIndex === index}
                                removeMedia={removeMedia}
                                moveMedia={moveMedia}
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                onEdit={val.originalMedia.media_type === 'image' ? () => setEditingMediaId(val.mediaId) : undefined}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {editingMedia && (
                <MediaEditModal
                    isOpen={true}
                    onClose={() => setEditingMediaId(null)}
                    imageSrc={editingMedia.reader}
                    initialEdit={editingMedia.edit}
                    onSave={(params) => handleMediaEdited(editingMedia, params)}
                />
            )}
        </div>
    )
})

type MediaCardProps = {
    media: MediaType
    index: number
    total: number
    isDragging: boolean
    removeMedia: (media: MediaType) => void
    moveMedia: (fromIndex: number, toIndex: number) => void
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
    onDragEnd: () => void
    onEdit?: () => void
}

const MediaCard = ({ media, index, total, isDragging, removeMedia, moveMedia, onDragStart, onDragOver, onDrop, onDragEnd, onEdit }: MediaCardProps) => {
    // Native HTML5 DnD attrs/handlers live on a plain <div>, not the
    // motion.div — framer-motion reserves the onDragStart/onDragEnd prop
    // names for its own gesture system (different event signature), which
    // was silently swallowing the native drag events here before.
    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            className="cursor-grab active:cursor-grabbing aspect-square"
        >
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group relative rounded-lg overflow-hidden bg-surface border border-border shadow-sm w-full h-full">
            {/* Position control — always visible (not hover-gated: hover
                doesn't exist on touch), big enough to tap. Nudges one step
                at a time so the move is always a predictable, visible swap. */}
            <div className="absolute top-2 left-2 z-20 flex items-center gap-0.5 bg-surface/95 backdrop-blur-md rounded-full border border-border shadow-sm">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); moveMedia(index, index - 1) }}
                    disabled={index === 0}
                    title="Move earlier"
                    className="w-7 h-7 flex items-center justify-center rounded-full text-text-s hover:text-accent hover:bg-accent-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold text-text w-4 text-center">{index + 1}</span>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); moveMedia(index, index + 1) }}
                    disabled={index === total - 1}
                    title="Move later"
                    className="w-7 h-7 flex items-center justify-center rounded-full text-text-s hover:text-accent hover:bg-accent-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Delete Button */}
            <button
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-pill bg-surface/95 text-text flex items-center justify-center backdrop-blur-md hover:bg-danger hover:text-white border border-border shadow-sm transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                onClick={(e) => {
                    e.stopPropagation()
                    removeMedia(media)
                }}
                title="Remove">
                <Trash2 className="w-4 h-4" />
            </button>

            {/* Edit/Crop Button — images only */}
            {onEdit && (
                <button
                    className={cn(
                        "absolute bottom-2 left-2 z-10 px-3 py-1.5 rounded-pill text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border shadow-sm transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                        media.edit ? "bg-accent text-white border-transparent" : "bg-surface/95 text-text hover:bg-surface border-border"
                    )}
                    onClick={(e) => {
                        e.stopPropagation()
                        onEdit()
                    }}>
                    <Pencil className="w-3.5 h-3.5" />
                    {media.edit ? 'Edited' : 'Edit'}
                </button>
            )}

            {/* Filename — always visible on a scrim (mobile has no hover) */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
                <p className="text-white text-xs font-medium truncate drop-shadow-md">
                    {media.originalMedia.fileName}
                </p>
            </div>

            {media.originalMedia.media_type === 'video' ? (
                <video
                    src={media.reader}
                    className="w-full h-full object-cover"
                    controls={false}
                    muted
                    autoPlay
                    loop
                />
            ) : (
                <img
                    src={media.reader}
                    alt={media.originalMedia.fileName}
                    className="w-full h-full object-cover"
                    style={media.edit ? { filter: editFilterString(media.edit) } : undefined}
                />
            )}
        </motion.div>
        </div>
    )
}
