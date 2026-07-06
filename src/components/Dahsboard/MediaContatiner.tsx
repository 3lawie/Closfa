import { RefObject, useRef, useState } from "react"
import z from "zod"
import { MediaZod, ALLOWED_MEDIA_TYPES } from "@/lib/entities/Post"
import { getMediaDimensions, getMediaType } from "@/lib/utils/file"


const MediaType = z.object({
    originalMedia: MediaZod.omit({ mediaUrl: true, category: true }),
    editedMedia: MediaZod.omit({ mediaUrl: true, category: true }).optional(),
    reader: z.string()
})

type MediaType = z.infer<typeof MediaType>
type DivRef = HTMLDivElement | null

export function MediaContatiner() {
    const [medias, setMedias] = useState<MediaType[]>([])
    const fileInput = useRef<HTMLInputElement>(null)
    const contatinerRef = useRef<DivRef>(null)

    async function addFileToMedias(file: File) {
        const mediaType = getMediaType(file.type)
        const dims = await getMediaDimensions(file)

        setMedias(prev => [...prev, {
            originalMedia: {
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type as typeof ALLOWED_MEDIA_TYPES[number],
                mediaType: mediaType,
                ...dims,
            },
            editedMedia: undefined,
            reader: URL.createObjectURL(file),
        }])
    }

    function removeMedia(media: MediaType) {
        setMedias(medias.filter(val => val.originalMedia.fileName !== media.originalMedia.fileName))
        URL.revokeObjectURL(media.reader)
    }

    function handleFile() {
        const file = fileInput.current?.files?.[0]
        if (!file) return

        if (file.size > 12 * 1024 * 1024) {
            alert("File size must be less than 12MB")
            return
        }
        addFileToMedias(file)
    }

    function handlePaste(e: React.ClipboardEvent) {
        const files = e.clipboardData.files
        if (!files) return
        for (const file of files) {
            if (file) addFileToMedias(file)
        }
    }


    return (
        <div ref={contatinerRef} onPaste={handlePaste} className="relative mt-4 w-[calc(100vw-4rem)] border-yellow border-5 flex  ">
            <p >Media Contatier</p>
            {
                medias.map((val, idx) => {
                    return <div key={idx}>
                        <MediaCard media={val} removeMedia={removeMedia} contatinerRef={contatinerRef} />
                    </div>
                })
            }
            <input type="file" onClick={handleFile} ref={fileInput} />
        </div>

    )
}

const MediaCard = ({ media, removeMedia, contatinerRef }: { media: MediaType, removeMedia: (media: MediaType) => void, contatinerRef: RefObject<DivRef> }) => {
    const ref = useRef<DivRef>(null)
    const parentRef = contatinerRef.current
    return (
        <div ref={ref} className="flex flex-col items-center justify-center relative
         hover:border-[5px] hover:border-dashed hover:border-gray-500 pt-4" aria-label="Medias Card"
            onMouseDown={() => DragMedia(parentRef, ref.current!)} >
            <img src={media.reader} alt={media.originalMedia.fileName} aria-label={`image ${media.originalMedia.fileName}`} />
            <button className="absolute bottom-0 right-10 bg-white-600 text-black rounded-full"
                onClick={() => enterMediaEdit(media)}
            >
                edit
            </button>
            <button className="absolute bottom-10 right-10 bg-white-600 text-black rounded-full" onClick={() => MoveMedia(parentRef, ref.current!)}>Move</button>
            <button className="absolute bottom-20 right-10 bg-white-600 text-red-500 rounded-full" onClick={() => { removeMedia(media); }}>delete</button>
        </div>
    )
}



function enterMediaEdit(media: MediaType) {

}

function MoveMedia(parentRef: DivRef, cardRef: DivRef) {
    if (!parentRef || !cardRef) return
    const { width, height } = parentRef.getBoundingClientRect()
    const { width: cardWidth, height: cardHeight } = cardRef.getBoundingClientRect()
}

function DragMedia(parentRef: DivRef, cardRef: DivRef) {
    if (!parentRef || !cardRef) return
    const { width, height } = parentRef.getBoundingClientRect()
    const { width: cardWidth, height: cardHeight } = cardRef.getBoundingClientRect()

}
