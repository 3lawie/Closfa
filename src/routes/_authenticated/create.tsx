import { RefObject, useRef, useState } from "react"
import z from "zod"
import { MediaZod, ALLOWED_MEDIA_TYPES } from "@/lib/entities/Post"
import { MediaContatiner } from "@/components/Dahsboard/MediaContatiner"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { getSession } from "@/server/lib/session"


const MediaType = z.object({
    originalMedia: MediaZod.omit({ mediaUrl: true, category: true }),
    editedMedia: MediaZod.omit({ mediaUrl: true, category: true }).optional(),
    reader: z.string()
})

type MediaType = z.infer<typeof MediaType>
type DivRef = HTMLDivElement | null

export const Route = createFileRoute('/_authenticated/create')({
    loader: async () => {
        // Session is already guaranteed by _authenticated layout, but we fetch it
        // here if we need user data.
        const result = await getSession()
        if (!result.session) {
            throw redirect({ to: '/onboarding' })
        }
        return { session: result.session }
    },
    component: CreatePost,
})


function CreatePost() {

    return (

        <>
            <MediaContatiner />
            <div>
                Contetn

            </div>

        </>
    )
}

