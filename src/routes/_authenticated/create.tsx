import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { MediaContatiner } from "@/components/Dahsboard/MediaContatiner"
import { loadAllMedias, clearAllMedias } from "@/lib/utils/mediaDB"
import { getImageKitAuth } from "@/server/actions/ThirdParty/ImageKit/imagekit.service"
import { createPostWithMedia } from "@/server/actions/Database/services/post.service"
import { upload } from "@imagekit/react"
import { clientEnv } from "@/lib/env/client-env"

export const Route = createFileRoute('/_authenticated/create')({
    // No loader: session is guaranteed by _authenticated's beforeLoad and read
    // from route context — the previous loader re-decrypted it for no benefit.
    component: CreatePost,
})

function CreatePost() {
    const [content, setContent] = useState("")
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState("")
    const { session } = Route.useRouteContext()
    const router = useRouter()

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
                const auth = await getImageKitAuth({
                    data: {
                        mimeType: m.mimeType,
                        fileSizeBytes: m.blob.size,
                        fileName: m.fileName,
                    },
                })
                const response = await upload({
                    file: m.blob,
                    fileName: m.fileName,
                    token: auth.token,
                    signature: auth.signature,
                    expire: auth.expire,
                    publicKey: clientEnv.imagekitPublicKey,
                })
                if (!response?.filePath) throw new Error(`Upload failed for ${m.fileName}`)
                const { mediaType, fileName, mimeType, fileSize, width, height, duration } = m.metadata.originalMedia
                media.push({
                    mediaUrl: response.filePath.replace(/^\//, ""),
                    mediaType,
                    fileName,
                    mimeType,
                    fileSize,
                    width,
                    height,
                    duration,
                })
            }

            const res = await createPostWithMedia({
                data: {
                    content: content.trim() || undefined,
                    media,
                },
            })

            if (!res.ok) {
                setErrorMessage(res.message)
                setStatus('error')
                return
            }

            await clearAllMedias()
            setStatus('success')
            router.navigate({ to: '/' })
        } catch (err) {
            setStatus('error')
            setErrorMessage(err instanceof Error ? err.message : 'Failed to publish')
        }
    }

    return (
        <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg)' }}>
            <div className="max-w-3xl mx-auto">
                {/* Header Section */}
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-h)' }}>Create Post</h1>
                    <button
                        onClick={handlePublish}
                        disabled={status === 'uploading'}
                        className="text-white px-5 py-2 rounded-full font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60"
                        style={{ backgroundColor: 'var(--accent)' }}
                    >
                        {status === 'uploading' ? 'Publishing…' : 'Publish'}
                    </button>
                </div>

                {/* Status messages */}
                {status === 'error' && (
                    <p className="mb-4 text-sm text-red-600">{errorMessage}</p>
                )}
                {status === 'success' && (
                    <p className="mb-4 text-sm text-emerald-600">Post published successfully!</p>
                )}

                {/* Main Composer Card */}
                <div className="rounded-2xl shadow-sm overflow-hidden border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>

                    {/* User Info & Text Input Area */}
                    <div className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-inner" style={{ backgroundColor: 'var(--brand)' }}>
                                {session.name?.charAt(0).toUpperCase() || "U"}
                            </div>
                            <div className="flex-1">
                                <textarea
                                    className="w-full resize-none border-0 bg-transparent text-lg focus:ring-0 p-0"
                                    style={{ color: 'var(--text-h)' }}
                                    rows={3}
                                    placeholder="What do you want to share?"
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Media Container Section */}
                    <div className="px-6 pb-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                        <MediaContatiner />
                    </div>

                </div>
            </div>
        </div>
    )
}
