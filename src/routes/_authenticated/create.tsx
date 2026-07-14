import { useEffect, useRef, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MediaContatiner, type MediaContainerHandle } from "@/components/Dahsboard/MediaContatiner"
import { MentionTextarea } from "@/components/feed/MentionTextarea"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { loadAllMedias, clearAllMedias } from "@/lib/utils/mediaDB"
import { applyImageEdit } from "@/lib/utils/imageEdit"
import { getImageKitAuthBatch } from "@/server/actions/ThirdParty/ImageKit/imagekit.service"
import { createPostWithMedia } from "@/server/actions/Database/services/post.service"
import { searchUsersByNicknameFn } from "@/server/actions/Database/services/user.service"
import { upload } from "@imagekit/react"
import { clientEnv } from "@/lib/env/client-env"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils/cn"
import { AlertCircle, CheckCircle2, AtSign, Eraser, Sparkles, Gauge, Users, X } from "lucide-react"

export const Route = createFileRoute('/_authenticated/create')({
    component: CreatePost,
})

const DRAFT_KEY = 'closfa:draft:content'

function CreatePost() {
    // Lazy initializer (not a mount effect) — reads synchronously so there's
    // no empty-then-filled flash on first paint. Media already survives
    // navigation via IndexedDB (MediaContatiner); only the text needed this.
    const [content, setContent] = useState(() => {
        try {
            return localStorage.getItem(DRAFT_KEY) ?? ""
        } catch {
            return ""
        }
    })
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState("")
    // Weighted publish stages, not a binary spinner — "Preparing" (edit bake),
    // "Requesting upload access" (the one batched auth round trip), "Uploading
    // media" (driven by real byte progress across every parallel upload), then
    // "Publishing".
    const [progress, setProgress] = useState(0)
    const [stageLabel, setStageLabel] = useState("")
    const [showClearConfirm, setShowClearConfirm] = useState(false)
    const [mediaQuality, setMediaQuality] = useState<'compressed' | 'original'>('compressed')
    const [collaborator, setCollaborator] = useState<{ userId: string; nickname: string | null; name: string } | null>(null)
    const [collaboratorQuery, setCollaboratorQuery] = useState('')
    const { session } = Route.useRouteContext()
    const router = useRouter()
    const queryClient = useQueryClient()
    const mediaRef = useRef<MediaContainerHandle>(null)

    const collaboratorSearch = useQuery({
        queryKey: ['userSearch', 'collaborator', collaboratorQuery],
        queryFn: () => searchUsersByNicknameFn({ data: { query: collaboratorQuery } }),
        enabled: collaboratorQuery.trim().length > 0 && !collaborator,
    })

    useEffect(() => {
        try {
            localStorage.setItem(DRAFT_KEY, content)
        } catch {
            // Draft autosave is best-effort — a full/unavailable localStorage
            // shouldn't block typing.
        }
    }, [content])

    function handleClear() {
        setContent("")
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* best-effort */ }
        mediaRef.current?.clear()
        setCollaborator(null)
        setCollaboratorQuery('')
        setShowClearConfirm(false)
    }

    const handlePublish = async () => {
        setStatus('uploading')
        setErrorMessage("")
        setProgress(0)
        setStageLabel('Preparing…')
        try {
            const stored = await loadAllMedias()
            if (content.trim() === "" && stored.length === 0) {
                setErrorMessage('Add some text or media')
                setStatus('error')
                return
            }

            // Stage 1 (0-5%): bake any pending image edits. Non-destructive up
            // to this point (MediaEditModal only ever saved crop/adjustment
            // params) — this is the one place they're actually baked into
            // pixels, right before upload, so the staged original stays intact
            // if the user navigates away without publishing. Runs in parallel
            // (Promise.all, mirroring src/routes/index.tsx's loader) rather
            // than the previous for...of — publishing used to take roughly
            // N times as long as a single file for N attachments.
            const prepared = await Promise.all(stored.map(async (m) => {
                const { media_type, fileName, mimeType, duration } = m.metadata.originalMedia
                let { fileSize, width, height } = m.metadata.originalMedia
                let fileToUpload: Blob = m.blob
                if (media_type === 'image' && m.metadata.editParams) {
                    const edited = await applyImageEdit(m.blob, m.metadata.editParams, mimeType)
                    fileToUpload = edited.blob
                    width = edited.width
                    height = edited.height
                    fileSize = edited.blob.size
                }
                return { stored: m, media_type, fileName, mimeType, duration, fileSize, width, height, fileToUpload }
            }))
            setProgress(5)

            // Stage 2 (5-15%): one batched auth call covering every file AND
            // every paired thumbnail, instead of a separate round trip each —
            // the token/signature are per-call-independent (see
            // imagekit.service.ts), so batching costs nothing.
            setStageLabel('Requesting upload access…')
            type UploadJob = { kind: 'main' | 'thumb'; parentIndex: number; blob: Blob; fileName: string; mimeType: string }
            const jobs: UploadJob[] = []
            prepared.forEach((p, i) => {
                jobs.push({ kind: 'main', parentIndex: i, blob: p.fileToUpload, fileName: p.fileName, mimeType: p.mimeType })
                // A separately-uploaded file, not baked into the video's own
                // ImageKit entry, since it needs its own small size/format
                // independent of the source video. The background Worker
                // (MediaContatiner.tsx) may not have finished by the time the
                // user hits Publish — that's fine, best-effort below.
                if (p.stored.thumbnailBlob) {
                    jobs.push({ kind: 'thumb', parentIndex: i, blob: p.stored.thumbnailBlob, fileName: `${p.fileName}.thumb.webp`, mimeType: 'image/webp' })
                }
            })
            const authTokens = jobs.length > 0
                ? await getImageKitAuthBatch({
                    data: { files: jobs.map((j) => ({ mimeType: j.mimeType, fileSizeBytes: j.blob.size, fileName: j.fileName })) },
                })
                : []
            setProgress(15)

            // Stage 3 (15-90%): every upload in parallel, each contributing
            // real byte progress (ImageKit's SDK exposes onProgress) toward
            // one aggregate percentage weighted by file size.
            setStageLabel('Uploading media…')
            const totalBytes = jobs.reduce((sum, j) => sum + j.blob.size, 0) || 1
            const loadedBytes = new Array(jobs.length).fill(0)
            function reportUploadProgress() {
                const loaded = loadedBytes.reduce((a: number, b: number) => a + b, 0)
                setProgress(15 + Math.min(1, loaded / totalBytes) * 75)
            }

            const uploadResults = await Promise.all(jobs.map(async (job, i) => {
                const auth = authTokens[i]
                try {
                    const response = await upload({
                        file: job.blob,
                        fileName: job.fileName,
                        token: auth.token,
                        signature: auth.signature,
                        expire: auth.expire,
                        publicKey: clientEnv.imagekitPublicKey,
                        onProgress: (event) => {
                            if (event.lengthComputable) {
                                loadedBytes[i] = event.loaded
                                reportUploadProgress()
                            }
                        },
                    })
                    if (!response?.filePath) throw new Error(`Upload failed for ${job.fileName}`)
                    return { job, filePath: response.filePath.replace(/^\//, "") as string | undefined }
                } catch (uploadErr) {
                    // Thumbnails stay best-effort, exactly as before — losing
                    // one doesn't lose the whole post. A main file failing
                    // still aborts the publish; there'd be nothing to point
                    // the post's media row at otherwise.
                    if (job.kind === 'thumb') {
                        console.error('Thumbnail upload failed (non-fatal):', uploadErr)
                        return { job, filePath: undefined }
                    }
                    throw uploadErr
                }
            }))
            setProgress(90)

            setStageLabel('Publishing…')
            const media = prepared.map((p, i) => {
                const mainResult = uploadResults.find((r) => r.job.kind === 'main' && r.job.parentIndex === i)
                const thumbResult = uploadResults.find((r) => r.job.kind === 'thumb' && r.job.parentIndex === i)
                return {
                    mediaUrl: mainResult!.filePath!,
                    mediaType: p.media_type,
                    fileName: p.fileName,
                    mimeType: p.mimeType,
                    fileSize: p.fileSize,
                    width: p.width,
                    height: p.height,
                    duration: typeof p.duration === 'number' ? Math.max(1, Math.round(p.duration)) : undefined,
                    thumbnailUrl: thumbResult?.filePath,
                }
            })

            const res = await createPostWithMedia({
                data: {
                    content: content.trim() || undefined,
                    mediaQuality,
                    media,
                    collaboratorUserId: collaborator?.userId,
                },
            })

            if (!res.ok) {
                setErrorMessage(res.message)
                setStatus('error')
                return
            }

            setProgress(100)
            await clearAllMedias()
            try { localStorage.removeItem(DRAFT_KEY) } catch { /* best-effort */ }
            setStatus('success')
            // Without this, the feed queries' 30s staleTime + loader-seeded
            // initialData meant the new post was invisible until a manual
            // refresh — navigating back doesn't refetch on its own.
            await queryClient.invalidateQueries({ queryKey: ['feed'] })
            router.navigate({ to: '/' })
        } catch (err) {
            setStatus('error')
            setErrorMessage(err instanceof Error ? err.message : 'Failed to publish')
        }
    }

    return (
        <div className="w-full max-w-3xl mx-auto pb-24">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-6"
            >
                {/* Header Section */}
                <header className="flex items-center justify-between px-2 md:px-0">
                    <h1 className="text-3xl font-black tracking-tight text-text">Create Post</h1>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setShowClearConfirm(true)}
                            disabled={status === 'uploading'}
                        >
                            <span className="flex items-center gap-2">
                                <Eraser className="w-4 h-4" />
                                Clear
                            </span>
                        </Button>
                        <Button
                            onClick={handlePublish}
                            isPending={status === 'uploading'}
                            className="rounded-[var(--r-pill)] px-8 py-6 text-[15px]"
                        >
                            Publish
                        </Button>
                    </div>
                </header>

                {/* Status messages */}
                {status === 'uploading' && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-surface p-4 rounded-lg border border-border mx-2 md:mx-0 flex flex-col gap-2"
                    >
                        <div className="flex items-center justify-between text-xs font-semibold text-text-s">
                            <span>{stageLabel}</span>
                            <span className="tabular-nums">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-accent rounded-full"
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                            />
                        </div>
                    </motion.div>
                )}
                {status === 'error' && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-danger/10 text-danger p-4 rounded-lg text-sm font-medium border border-danger/20 mx-2 md:mx-0 flex items-center gap-3"
                    >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {errorMessage}
                    </motion.div>
                )}
                {status === 'success' && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-accent-bg text-accent p-4 rounded-lg text-sm font-medium border border-accent-border mx-2 md:mx-0 flex items-center gap-3"
                    >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Post published successfully!
                    </motion.div>
                )}

                {/* Main Composer Card */}
                <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden mx-2 md:mx-0">

                    {/* User Info & Text Input Area */}
                    <div className="p-6">
                        <div className="flex gap-4">
                            <div className="w-12 h-12 rounded-full bg-accent-bg text-accent flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
                                {session.name?.charAt(0).toUpperCase() || "U"}
                            </div>
                            <div className="flex-1 min-w-0 pt-2">
                                <MentionTextarea
                                    className="w-full bg-transparent text-xl md:text-2xl font-medium text-text placeholder:text-text-s focus:outline-none resize-none custom-scrollbar"
                                    rows={4}
                                    placeholder="What's on your mind?"
                                    value={content}
                                    onChange={setContent}
                                />
                                <p className="flex items-center gap-1.5 text-xs text-text-s mt-2">
                                    <AtSign className="w-3 h-3" />
                                    Type @ to mention someone
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Media Container Section */}
                    <div className="bg-surface-translucent border-t border-border p-6 flex flex-col gap-6">
                        {/* Default display quality — how viewers' feed/lightbox
                            requests this post's images by default. Doesn't
                            affect what gets uploaded, only which URL viewers
                            get first; either way "View full resolution" and
                            the AVIF/original toggle in the lightbox still work. */}
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="text-sm font-bold text-text">Default image quality</h3>
                                <p className="text-xs text-text-s mt-0.5">
                                    Compressed loads faster; original looks sharper but uses more data.
                                </p>
                            </div>
                            <div className="flex items-center bg-surface rounded-[var(--r-pill)] border border-border p-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setMediaQuality('compressed')}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-pill)] text-xs font-semibold transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                                        mediaQuality === 'compressed' ? "bg-accent text-white" : "text-text-s hover:text-text"
                                    )}
                                >
                                    <Gauge className="w-3.5 h-3.5" />
                                    Compressed
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMediaQuality('original')}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-pill)] text-xs font-semibold transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                                        mediaQuality === 'original' ? "bg-accent text-white" : "text-text-s hover:text-text"
                                    )}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Original
                                </button>
                            </div>
                        </div>

                        {/* Collab invite — the post publishes normally either
                            way; this just sends a pending co-author request
                            that shows up on the invitee's My Posts page for
                            them to agree to (see post_type: 'collab'). */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Users className="w-4 h-4 text-text-s" />
                                <h3 className="text-sm font-bold text-text">Invite a collaborator</h3>
                            </div>
                            {collaborator ? (
                                <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-md px-3 py-2">
                                    <span className="text-sm font-medium text-text">
                                        {collaborator.name} <span className="text-text-s">@{collaborator.nickname}</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCollaborator(null)}
                                        aria-label="Remove collaborator"
                                        className="text-text-s hover:text-danger"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={collaboratorQuery}
                                        onChange={(e) => setCollaboratorQuery(e.target.value)}
                                        placeholder="Search a nickname to co-author this post…"
                                        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                                    />
                                    {collaboratorSearch.data && collaboratorSearch.data.length > 0 && (
                                        <ul className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                                            {collaboratorSearch.data
                                                .filter((u) => u.userId !== session.userId)
                                                .map((u) => (
                                                    <li key={u.userId}>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setCollaborator(u); setCollaboratorQuery('') }}
                                                            className="w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                                                        >
                                                            {u.name} <span className="text-text-s">@{u.nickname}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        <MediaContatiner ref={mediaRef}/>
                    </div>

                </div>
            </motion.div>

            <ConfirmDialog
                isOpen={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={handleClear}
                title="Clear this post?"
                description="Your text and any added media will be discarded. This cannot be undone."
                confirmLabel="Clear"
            />
        </div>
    )
}
