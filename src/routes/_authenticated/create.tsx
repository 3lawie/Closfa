import { useEffect, useRef, useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MediaContatiner, type MediaContainerHandle } from "@/components/Dahsboard/MediaContatiner"
import { MentionTextarea } from "@/components/feed/MentionTextarea"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { loadAllMedias, clearAllMedias } from "@/lib/utils/mediaDB"
import { applyImageEdit } from "@/lib/utils/imageEdit"
import { getImageKitAuth } from "@/server/actions/ThirdParty/ImageKit/imagekit.service"
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
        try {
            const stored = await loadAllMedias()
            if (content.trim() === "" && stored.length === 0) {
                setErrorMessage('Add some text or media')
                setStatus('error')
                return
            }

            const media: {
                mediaUrl: string
                mediaType: 'image' | 'video' | 'audio'
                fileName: string
                mimeType: string
                fileSize?: number
                width?: number
                height?: number
                duration?: number
            }[] = []

            for (const m of stored) {
                const { media_type, fileName, mimeType, duration } = m.metadata.originalMedia
                let { fileSize, width, height } = m.metadata.originalMedia
                // Editing is non-destructive up to this point (MediaEditModal
                // only ever saved crop/adjustment params) — this is the one
                // place they're actually baked into pixels, right before
                // upload, so the staged original stays intact if the user
                // navigates away without publishing.
                let fileToUpload: Blob = m.blob
                if (media_type === 'image' && m.metadata.editParams) {
                    const edited = await applyImageEdit(m.blob, m.metadata.editParams, mimeType)
                    fileToUpload = edited.blob
                    width = edited.width
                    height = edited.height
                    fileSize = edited.blob.size
                }

                const auth = await getImageKitAuth({
                    data: {
                        mimeType,
                        fileSizeBytes: fileToUpload.size,
                        fileName,
                    },
                })
                const response = await upload({
                    file: fileToUpload,
                    fileName,
                    token: auth.token,
                    signature: auth.signature,
                    expire: auth.expire,
                    publicKey: clientEnv.imagekitPublicKey,
                })
                if (!response?.filePath) throw new Error(`Upload failed for ${fileName}`)
                media.push({
                    mediaUrl: response.filePath.replace(/^\//, ""),
                    mediaType: media_type,
                    fileName,
                    mimeType,
                    fileSize,
                    width,
                    height,
                    duration: typeof duration === 'number' ? Math.max(1, Math.round(duration)) : undefined,
                })
            }

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
