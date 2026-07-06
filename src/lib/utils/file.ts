import { createElement } from "react"

export function getMediaType(mimeType: string): "image" | "video" | "audio" {
    if (mimeType.startsWith("image/")) return "image"
    if (mimeType.startsWith("video/")) return "video"
    if (mimeType.startsWith("audio/")) return "audio"
    throw new Error(`Unsupported media type: ${mimeType}`)
}

type videoMetadata = {
    duration: number
}

type audioMetadata = {
    duration: number
}

type imageMetadata = {
    width: number
    height: number
}


export async function getMediaDimensions(file: File): Promise<imageMetadata | videoMetadata | audioMetadata> {
    const url = URL.createObjectURL(file)
    const type = getMediaType(file.type)
    return new Promise((resolve, reject) => {
        switch (type) {
            case "image": {
                const img = new Image()
                img.onload = () => {
                    resolve({ width: img.naturalWidth, height: img.naturalHeight })
                    URL.revokeObjectURL(url)
                }
                img.onerror = () => {
                    reject(new Error("Failed to load image"))
                    URL.revokeObjectURL(url)
                }
                img.src = url
                break
            }
            case "video": {
                const video = document.createElement("video")
                video.onloadedmetadata = () => {
                    resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
                    URL.revokeObjectURL(url)
                    video.remove()
                }
                video.onerror = () => {
                    reject(new Error("Failed to load video"))
                    URL.revokeObjectURL(url)
                    video.remove()
                }
                video.src = url
                break
            }
            case "audio": {
                const audio = new Audio()
                audio.onloadedmetadata = () => {
                    resolve({ duration: audio.duration })
                    URL.revokeObjectURL(url)
                    audio.remove()
                }
                audio.onerror = () => {
                    reject(new Error("Failed to load audio"))
                    URL.revokeObjectURL(url)
                    audio.remove()
                }
                audio.src = url
                break
            }
            default:
                URL.revokeObjectURL(url)
                reject(new Error(`Unsupported media type: ${file.type}`))
        }
    })
}