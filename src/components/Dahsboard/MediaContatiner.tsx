import { useEffect, useImperativeHandle, forwardRef, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import z from "zod"
import { createId } from "@paralleldrive/cuid2"
import { MediaZod, ALLOWED_MEDIA_TYPES } from "@/lib/entities/Post"
import { getMediaDimensions, getMediaType } from "@/lib/utils/file"
import { saveMedia, loadAllMedias, deleteMedia, updateMediaMetadata, updateMediaThumbnail, clearAllMedias } from "@/lib/utils/mediaDB"
import { generateVideoThumbnail } from "@/lib/media/videoThumbnail"
import type { MediaEditParams } from "@/lib/utils/mediaDB"
import { editFilterString } from "@/lib/utils/imageEdit"
import { cn } from "@/lib/utils/cn"
import { formatDuration } from "@/lib/utils/format"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Trash2, Pencil, ChevronLeft, ChevronRight, ImageUp, Play, Pause } from "lucide-react"
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
    reader: z.string(),
    // Video-only: a blob URL preview of the current thumbnail (auto-
    // generated or manually uploaded), so the user can actually see what'll
    // ship — separate from `reader`, which is always the full video/image
    // itself, never the thumbnail.
    thumbnailReader: z.string().optional(),
})

type MediaType = z.infer<typeof MediaType>
type DivRef = HTMLDivElement | null

type ThumbnailGenState = { status: 'generating'; percent: number } | { status: 'ready' | 'failed' }

export interface MediaContainerHandle {
    clear: () => void
}

/** Where the pointer grabbed the tile, relative to its own top-left corner —
 *  keeps the ghost held at the same spot under the cursor it started at,
 *  instead of snapping to align its corner with the pointer. Set once at
 *  pointer-down and never touched again during the drag — every tile in
 *  this grid is the same aspect-square size, so the ghost's dimensions
 *  don't need to change just because `index` (which one we're hovering)
 *  changes — which is exactly why this is state, not a ref: it's read
 *  during render (to size/position the portal), so React needs to know
 *  about it. */
interface DragGeometry {
    offsetX: number
    offsetY: number
    width: number
    height: number
}

export const MediaContatiner = forwardRef<MediaContainerHandle>(function MediaContatiner(_props, ref) {
    const [medias, setMedias] = useState<MediaType[]>([])
    const [editingMediaId, setEditingMediaId] = useState<string | null>(null)
    const editingMedia = medias.find(m => m.mediaId === editingMediaId) ?? null
    const fileInput = useRef<HTMLInputElement>(null)
    const thumbnailInput = useRef<HTMLInputElement>(null)
    const thumbnailInputTargetId = useRef<string | null>(null)
    const contatinerRef = useRef<DivRef>(null)
    const blobUrlsRef = useRef<string[]>([])
    const thumbnailUrlsRef = useRef<string[]>([])

    // Per-video thumbnail generation progress, keyed by mediaId — separate
    // from the `medias` array itself so a percent tick doesn't re-render
    // every tile, only the one whose entry actually changed.
    const [thumbnailGen, setThumbnailGen] = useState<Record<string, ThumbnailGenState>>({})
    // Once a user manually picks a thumbnail, the still-in-flight auto-
    // generation for that same video must not clobber it when it finishes —
    // this is checked, not the React state above, since the callback that
    // needs it fires from inside a .then() outside any render.
    const manualThumbnailIds = useRef<Set<string>>(new Set())

    // ── Drag state ────────────────────────────────────────────────
    // `currentIndexRef` is a plain ref (never read during render, only
    // inside the window pointermove handler below) — it exists purely so
    // that handler can know which tile is currently "the dragged one"
    // without needing this effect to re-subscribe to a new closure every
    // time a reorder happens mid-drag (see the effect's dependency comment
    // further down for why that matters). `draggedIndex` is the render-
    // facing twin of the same value — it DOES need to be state, since it
    // drives the dimmed-original styling on the source tile.
    const currentIndexRef = useRef<number | null>(null)
    const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [dragGeometry, setDragGeometry] = useState<DragGeometry | null>(null)
    const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)

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
                thumbnailReader: entry.thumbnailBlob ? URL.createObjectURL(entry.thumbnailBlob) : undefined,
            }))
            setMedias(loaded)
            setThumbnailGen(Object.fromEntries(
                loaded.filter(m => m.thumbnailReader).map(m => [m.mediaId, { status: 'ready' as const }]),
            ))
        })
        return () => { cancelled = true }
    }, [])

    // 2. Keep refs in sync with current blob URLs
    useEffect(() => {
        blobUrlsRef.current = medias.map(m => m.reader)
        thumbnailUrlsRef.current = medias.flatMap(m => m.thumbnailReader ? [m.thumbnailReader] : [])
    }, [medias])

    // 3. Revoke all blob URLs on unmount only (empty deps)
    useEffect(() => {
        return () => {
            blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
            thumbnailUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
        }
    }, [])

    useImperativeHandle(ref, () => ({
        clear: () => {
            blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
            thumbnailUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
            setMedias([])
            setThumbnailGen({})
            manualThumbnailIds.current.clear()
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

            // Fire-and-forget: generates on its own schedule (idle-gated
            // Worker, see idleScheduler.ts) and patches IndexedDB whenever it
            // finishes — publishing doesn't wait on it, create.tsx just
            // checks whether it's ready by the time the user hits Publish.
            // The progress callback is the only reason this isn't a bare
            // .then() — everything else about the pipeline is unchanged.
            if (mediaType === 'video') {
                setThumbnailGen(prev => ({ ...prev, [mediaId]: { status: 'generating', percent: 0 } }))
                generateVideoThumbnail(file, (percent) => {
                    setThumbnailGen(prev =>
                        prev[mediaId]?.status === 'generating' ? { ...prev, [mediaId]: { status: 'generating', percent } } : prev,
                    )
                }).then((thumbnailBlob) => {
                    // A manual upload that landed while this was still running
                    // wins — don't let the slower auto-generation stomp it.
                    if (manualThumbnailIds.current.has(mediaId)) return

                    if (thumbnailBlob) {
                        updateMediaThumbnail(mediaId, thumbnailBlob)
                        const url = URL.createObjectURL(thumbnailBlob)
                        setMedias(prev => prev.map(m => m.mediaId === mediaId ? { ...m, thumbnailReader: url } : m))
                        setThumbnailGen(prev => ({ ...prev, [mediaId]: { status: 'ready' } }))
                    } else {
                        setThumbnailGen(prev => ({ ...prev, [mediaId]: { status: 'failed' } }))
                    }
                })
            }
        }

        setMedias(prev => [...prev, ...newEntries])
    }

    async function removeMedia(media: MediaType) {
        URL.revokeObjectURL(media.reader)
        if (media.thumbnailReader) URL.revokeObjectURL(media.thumbnailReader)
        manualThumbnailIds.current.delete(media.mediaId)
        await deleteMedia(media.mediaId)
        setMedias(prev => prev.filter(val => val.mediaId !== media.mediaId))
        setThumbnailGen(prev => {
            const next = { ...prev }
            delete next[media.mediaId]
            return next
        })
    }

    /** User-picked image, standing in for (or replacing) the auto-generated frame grab. No worker round-trip needed — it's already a still image, not a video frame to decode. */
    async function setManualThumbnail(mediaId: string, file: File) {
        manualThumbnailIds.current.add(mediaId)
        await updateMediaThumbnail(mediaId, file)
        const url = URL.createObjectURL(file)
        setMedias(prev => prev.map(m => {
            if (m.mediaId !== mediaId) return m
            if (m.thumbnailReader) URL.revokeObjectURL(m.thumbnailReader)
            return { ...m, thumbnailReader: url }
        }))
        setThumbnailGen(prev => ({ ...prev, [mediaId]: { status: 'ready' } }))
    }

    function handleThumbnailFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        const mediaId = thumbnailInputTargetId.current
        e.target.value = ""
        if (!file || !mediaId) return
        if (!file.type.startsWith('image/')) {
            toast('Thumbnail must be an image', { variant: 'danger' })
            return
        }
        setManualThumbnail(mediaId, file)
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

    function moveMedia(fromIndex: number, toIndex: number) {
        setMedias(prev => {
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= prev.length) return prev
            const next = [...prev]
            const [item] = next.splice(fromIndex, 1)
            next.splice(toIndex, 0, item)
            return next
        })
    }

    // ── Custom pointer-based drag ──────────────────────────────────
    // Why not native HTML5 drag-and-drop (draggable/onDragStart/onDrop)?
    // That API's "drag image" — the translucent element that follows your
    // cursor — is rendered by the browser itself from a snapshot; you can
    // swap in a custom image via dataTransfer.setDragImage(), but it's
    // still a static bitmap the browser owns, not a live React element you
    // can restyle mid-drag. Rendering the ghost as actual React output
    // (so it's the same MediaVisual component, not a rasterized copy)
    // means driving position from Pointer Events ourselves instead.
    //
    // Registering the move/up listeners on `window` (not the tile) is what
    // lets the drag continue tracking even once the pointer leaves the
    // original tile's bounds — exactly the case that matters here, since
    // the whole point is dragging across other tiles in the grid.
    const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
        // Ignore drags started on a button (delete/edit/position controls) —
        // only the tile's own body should pick up a drag.
        if ((e.target as HTMLElement).closest('button')) return
        // Only the primary mouse button / a single touch point.
        if (e.button !== 0 && e.pointerType === 'mouse') return

        const rect = e.currentTarget.getBoundingClientRect()
        currentIndexRef.current = index
        setDraggedIndex(index)
        setDragGeometry({
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            width: rect.width,
            height: rect.height,
        })
        setPointerPos({ x: e.clientX, y: e.clientY })
    }, [])

    useEffect(() => {
        if (draggedIndex === null) return

        function handlePointerMove(e: PointerEvent) {
            setPointerPos({ x: e.clientX, y: e.clientY })

            const fromIndex = currentIndexRef.current
            if (fromIndex === null) return

            // Which other tile is the pointer currently over? Compared by
            // bounding rect rather than document.elementFromPoint so it
            // still works while the ghost (pointer-events: none, see below)
            // sits directly over the grid.
            for (const [idx, el] of cardRefs.current) {
                if (idx === fromIndex) continue
                const rect = el.getBoundingClientRect()
                if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    moveMedia(fromIndex, idx)
                    currentIndexRef.current = idx
                    setDraggedIndex(idx)
                    break
                }
            }
        }

        function handlePointerUp() {
            currentIndexRef.current = null
            setDraggedIndex(null)
            setDragGeometry(null)
            setPointerPos(null)
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
        }
        // Deliberately keyed on "is a drag active", not on draggedIndex's
        // value — moveMedia's own reorders update draggedIndex constantly
        // during a single drag, and re-running this effect (removing and
        // re-adding window listeners) on every one of those would risk
        // dropping pointer events between the teardown and re-attach.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draggedIndex !== null])

    const draggedMedia = draggedIndex !== null ? medias[draggedIndex] : null

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

            {/* Shared across every video tile's "Set thumbnail" button — one
                hidden input, retargeted per click via thumbnailInputTargetId,
                rather than one input per tile. */}
            <input
                type="file"
                accept="image/*"
                onChange={handleThumbnailFileChange}
                ref={thumbnailInput}
                className="hidden"
            />

            {/* Uniform grid — every cell is the same size, so array order always
                matches reading order (a mosaic/dense-packed grid reflows spans
                independently of array order, which made "set position 3"
                visually land somewhere unexpected). auto-fill/minmax instead of
                a fixed grid-cols-2/3/4 ladder: tiles grow to fill the row (
                meaningfully bigger than the old fixed columns on anything but
                the narrowest phones) without a hardcoded breakpoint count. */}
            <AnimatePresence>
                {medias.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
                    >
                        {medias.map((val, index) => (
                            <MediaCard
                                key={val.mediaId}
                                cardRef={(el) => {
                                    if (el) cardRefs.current.set(index, el)
                                    else cardRefs.current.delete(index)
                                }}
                                media={val}
                                index={index}
                                total={medias.length}
                                isDragging={draggedIndex === index}
                                removeMedia={removeMedia}
                                moveMedia={moveMedia}
                                onPointerDown={(e) => handlePointerDown(e, index)}
                                onEdit={val.originalMedia.media_type === 'image' ? () => setEditingMediaId(val.mediaId) : undefined}
                                thumbnailState={thumbnailGen[val.mediaId]}
                                onPickThumbnail={val.originalMedia.media_type === 'video' ? () => {
                                    thumbnailInputTargetId.current = val.mediaId
                                    thumbnailInput.current?.click()
                                } : undefined}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* The drag ghost — a Portal, not a child of the grid. Rendered
                straight onto document.body so it can float above literally
                anything on the page (a Modal, the sticky header, whatever)
                without fighting the grid's own stacking context/overflow —
                the classic reason to reach for createPortal: you need the
                DOM position to be the body, while the React state/props
                keeping it in sync still flow from this component exactly
                like any other child. */}
            {draggedIndex !== null && pointerPos && dragGeometry && draggedMedia && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        left: pointerPos.x - dragGeometry.offsetX,
                        top: pointerPos.y - dragGeometry.offsetY,
                        width: dragGeometry.width,
                        height: dragGeometry.height,
                        zIndex: 9999,
                        pointerEvents: 'none', // never intercept the hit-testing the drag itself relies on
                    }}
                    className="rounded-lg overflow-hidden shadow-lg rotate-2 scale-105 ring-2 ring-accent"
                >
                    <MediaVisual media={draggedMedia} />
                </div>,
                document.body
            )}

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

/** Just the image/video/audio itself, no interactive chrome (besides audio's
 *  own play toggle, which has nowhere else to live) — shared between a
 *  normal grid tile and the drag ghost. */
function MediaVisual({ media }: { media: MediaType }) {
    if (media.originalMedia.media_type === 'video') {
        return (
            <video
                src={media.reader}
                className="w-full h-full object-cover"
                controls={false}
                muted
                autoPlay
                loop
            />
        )
    }
    if (media.originalMedia.media_type === 'audio') {
        return <AudioPreview media={media} />
    }
    return (
        <img
            src={media.reader}
            alt={media.originalMedia.fileName}
            className="w-full h-full object-cover"
            style={media.edit ? { filter: editFilterString(media.edit) } : undefined}
        />
    )
}

/** Audio has no visual frame to show the way a video does — previously this
 *  fell through to the image branch and tried to load the audio blob as an
 *  `<img src>`, rendering nothing at all. Same accent-card/circular-play
 *  language as the feed's AudioSlide, scaled down to a grid tile: a calm
 *  themed square with a working play/pause preview, not a broken image. */
function AudioPreview({ media }: { media: MediaType }) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const [playing, setPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    // Same reasoning as PostCard.tsx's AudioSlide — while the user is
    // actively dragging the seek thumb, the displayed position must come
    // from the input itself, not from onTimeUpdate, or an in-progress drag
    // keeps getting overwritten by a stale currentTime.
    const [seeking, setSeeking] = useState(false)
    const [seekValue, setSeekValue] = useState(0)

    function toggle(e: React.MouseEvent) {
        e.stopPropagation()
        const a = audioRef.current
        if (!a) return
        if (a.paused) a.play()
        else a.pause()
    }

    function seekTo(value: number) {
        setSeekValue(value)
        if (audioRef.current) audioRef.current.currentTime = value
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-accent-bg px-4">
            <audio
                ref={audioRef}
                src={media.reader}
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                // Some MP3s (VBR-encoded especially) report duration as NaN
                // or Infinity at loadedmetadata and only resolve the real
                // value afterward — durationchange fires again once that
                // happens, matching the same fix in PostCard.tsx's AudioSlide.
                onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
                onDurationChange={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
            />
            <button
                onClick={toggle}
                className="w-12 h-12 rounded-full bg-surface shadow-md border border-border flex items-center justify-center text-accent transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:scale-105"
                aria-label={playing ? 'Pause preview' : 'Play preview'}
            >
                {playing ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5 ml-0.5" fill="currentColor" />}
            </button>
            {/* stopPropagation on every pointer event — without it, dragging
                the thumb gets picked up by the tile's own reorder-drag
                handler (that handler only ignores drags starting on a
                <button>, and this is an <input>). */}
            <div className="w-full flex items-center gap-2">
                <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    value={seeking ? seekValue : currentTime}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    onPointerDown={(e) => { e.stopPropagation(); setSeeking(true); setSeekValue(currentTime) }}
                    onPointerUp={(e) => { e.stopPropagation(); setSeeking(false) }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: 'var(--brand)' }}
                    className="flex-1 h-1 cursor-pointer"
                    aria-label="Seek"
                />
                <span className="text-[10px] text-text-s font-mono tabular-nums shrink-0">
                    {formatDuration(seeking ? seekValue : currentTime)} / {formatDuration(duration)}
                </span>
            </div>
        </div>
    )
}

type MediaCardProps = {
    cardRef: (el: HTMLDivElement | null) => void
    media: MediaType
    index: number
    total: number
    isDragging: boolean
    removeMedia: (media: MediaType) => void
    moveMedia: (fromIndex: number, toIndex: number) => void
    onPointerDown: (e: React.PointerEvent) => void
    onEdit?: () => void
    thumbnailState?: ThumbnailGenState
    onPickThumbnail?: () => void
}

const MediaCard = ({ cardRef, media, index, total, isDragging, removeMedia, moveMedia, onPointerDown, onEdit, thumbnailState, onPickThumbnail }: MediaCardProps) => {
    const isVideo = media.originalMedia.media_type === 'video'
    const isAudio = media.originalMedia.media_type === 'audio'
    return (
        // Videos get a footer row (filename, thumbnail button, progress bar)
        // in normal document flow below the square preview instead of piling
        // onto the same absolute bottom-0 strip the square itself uses —
        // that's what was making the progress bar unreadable. Images have no
        // footer content, so they stay exactly as before: a single square
        // tile with everything overlaid.
        <div className="flex flex-col gap-2">
            <div
                ref={cardRef}
                onPointerDown={onPointerDown}
                // Suppresses the browser's own touch-scroll/zoom gestures on
                // this tile so a touch-drag doesn't fight the page underneath —
                // pointer events for an actual drag still fire normally.
                style={{ touchAction: 'none' }}
                className="cursor-grab active:cursor-grabbing aspect-square"
            >
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                // The original tile dims in place (not hidden) while its ghost
                // is the one actually following the cursor — the source stays
                // visible as a reference point for where it'll land.
                animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                // ring-[oklch(...)]: --brand's exact value (index.css) at 25%
                // alpha, hardcoded rather than var(--brand) because Tailwind's
                // opacity modifier can't reliably color-mix an opaque CSS var
                // it can't peek inside — a soft brand-yellow halo per request,
                // layered outside the existing neutral border, not replacing it.
                className="group relative rounded-lg overflow-hidden bg-surface border border-border ring-1 ring-[oklch(0.70_0.200_80/0.25)] shadow-sm w-full h-full">
                {/* Full-filename hover reveal — a themed replacement for the
                    native `title` tooltip, since filenames get truncated
                    elsewhere on the tile. Tilts open from the top edge like a
                    hinged flap (real 3D perspective, not just a fade) and
                    stays fully inside the tile's own bounds so the card's
                    overflow-hidden never clips it. */}
                <div
                    className="absolute top-2 left-2 right-2 z-30 opacity-0 pointer-events-none [transform:perspective(500px)_rotateX(16deg)_translateY(-6px)] transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] group-hover:opacity-100 group-hover:[transform:perspective(500px)_rotateX(0deg)_translateY(0px)]"
                    style={{ transformOrigin: 'top center' }}
                >
                    <div className="bg-surface/95 backdrop-blur-md border border-border rounded-md px-3 py-2 shadow-md border-b-2 border-b-[oklch(0.70_0.200_80/0.6)]">
                        <p className="text-text-h text-[11px] font-semibold break-words">
                            {media.originalMedia.fileName}
                        </p>
                    </div>
                </div>

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

                {/* Edit/Crop Button — images only, still overlaid (images have
                    no footer, nothing else competes for this corner) */}
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

                {/* Filename — images only get the black photo-scrim; it exists
                    purely for legibility over arbitrary photo content, which
                    doesn't apply to audio's flat accent-tinted card (a black
                    gradient there just reads as an unthemed foreign block).
                    Videos show their filename in the footer below instead. */}
                {!isVideo && !isAudio && (
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
                        <p className="text-white text-xs font-medium truncate drop-shadow-md">
                            {media.originalMedia.fileName}
                        </p>
                    </div>
                )}
                {isAudio && (
                    <div className="absolute inset-x-0 bottom-0 p-2.5 flex pointer-events-none">
                        <span className="text-text-s text-[11px] font-medium truncate bg-surface/80 backdrop-blur-md px-2.5 py-1 rounded-pill border border-border">
                            {media.originalMedia.fileName}
                        </span>
                    </div>
                )}

                <MediaVisual media={media} />
            </motion.div>
            </div>

            {/* Video footer — normal flow, not an overlay, so the filename,
                the thumbnail button, and the progress bar each get their own
                row instead of fighting for the same bottom-0 strip. */}
            {isVideo && (
                <div className="flex flex-col gap-1.5 px-0.5">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-text-s truncate min-w-0">
                            {media.originalMedia.fileName}
                        </p>
                        {onPickThumbnail && (
                            <button
                                className={cn(
                                    "shrink-0 px-3 py-1.5 rounded-pill text-xs font-bold flex items-center gap-1.5 border transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                                    thumbnailState?.status === 'ready' ? "bg-accent text-white border-transparent" : "bg-surface text-text hover:bg-accent-bg border-border"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onPickThumbnail()
                                }}
                                title="Upload a custom thumbnail image"
                            >
                                <ImageUp className="w-3.5 h-3.5" />
                                {thumbnailState?.status === 'ready' ? 'Thumbnail set' : 'Set thumbnail'}
                            </button>
                        )}
                    </div>

                    {/* Auto-generation progress — its own row now, so it's
                        never competing with the filename or the button for
                        space. */}
                    {thumbnailState?.status === 'generating' && (
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-border rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-accent rounded-full"
                                    animate={{ width: `${thumbnailState.percent}%` }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                />
                            </div>
                            <span className="text-[11px] font-semibold text-text-s tabular-nums shrink-0">
                                {thumbnailState.percent}%
                            </span>
                        </div>
                    )}
                    {thumbnailState?.status === 'failed' && (
                        <p className="text-[11px] font-semibold text-danger">Thumbnail generation failed — upload one manually.</p>
                    )}
                </div>
            )}
        </div>
    )
}
