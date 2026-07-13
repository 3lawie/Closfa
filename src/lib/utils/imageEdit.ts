import type { MediaEditParams } from './mediaDB'

export function editFilterString(params: Pick<MediaEditParams, 'brightness' | 'contrast' | 'saturation'>): string {
    return `brightness(${100 + params.brightness}%) contrast(${100 + params.contrast}%) saturate(${100 + params.saturation}%)`
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = src
    })
}

/** Bakes crop + color adjustments into a real image. Called once, at publish
 *  time — editing itself stays non-destructive (see MediaEditModal). */
export async function applyImageEdit(
    blob: Blob,
    params: MediaEditParams,
    mimeType: string,
): Promise<{ blob: Blob; width: number; height: number }> {
    const url = URL.createObjectURL(blob)
    try {
        const img = await loadImage(url)
        const natW = img.naturalWidth
        const natH = img.naturalHeight
        const cropX = (params.crop.x / 100) * natW
        const cropY = (params.crop.y / 100) * natH
        const cropW = (params.crop.width / 100) * natW
        const cropH = (params.crop.height / 100) * natH

        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(cropW))
        canvas.height = Math.max(1, Math.round(cropH))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas not supported')
        ctx.filter = editFilterString(params)
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height)

        const outBlob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob(resolve, mimeType || 'image/jpeg', 0.92)
        )
        if (!outBlob) throw new Error('Failed to export edited image')
        return { blob: outBlob, width: canvas.width, height: canvas.height }
    } finally {
        URL.revokeObjectURL(url)
    }
}
