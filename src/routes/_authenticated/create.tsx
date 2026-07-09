import { useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { getSession } from "@/server/lib/session"
import { MediaContatiner } from "@/components/Dahsboard/MediaContatiner"

export const Route = createFileRoute('/_authenticated/create')({
    loader: async () => {
        // Session is already guaranteed by _authenticated layout
        const result = await getSession()
        if (!result.session) {
            throw redirect({ to: '/onboarding' })
        }
        return { session: result.session }
    },
    component: CreatePost,
})

function CreatePost() {
    const [content, setContent] = useState("")
    const { session } = Route.useLoaderData()

    const handlePublish = async () => {
        // TODO: Handle batch uploading files from IndexedDB and creating the post
        console.log("Publishing post...", { content })
    }

    return (
        <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg)' }}>
            <div className="max-w-3xl mx-auto">
                {/* Header Section */}
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-h)' }}>Create Post</h1>
                    <button
                        onClick={handlePublish}
                        className="text-white px-5 py-2 rounded-full font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                        style={{ backgroundColor: 'var(--accent)' }}
                    >
                        Publish
                    </button>
                </div>

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
