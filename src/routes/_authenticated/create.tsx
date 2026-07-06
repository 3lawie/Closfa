import { RefObject, useRef, useState } from "react"
import z from "zod"
import { MediaZod, ALLOWED_MEDIA_TYPES } from "@/lib/entities/Post"
import { MediaContatiner } from "@/components/Dahsboard/MediaContatiner"


const MediaType = z.object({
    originalMedia: MediaZod.omit({ mediaUrl: true, category: true }),
    editedMedia: MediaZod.omit({ mediaUrl: true, category: true }).optional(),
    reader: z.string()
})

type MediaType = z.infer<typeof MediaType>
type DivRef = HTMLDivElement | null




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

