import {
  ImageKitAbortError,
  ImageKitInvalidRequestError,
  ImageKitServerError,
  ImageKitUploadNetworkError,
  upload,
} from '@imagekit/react'
import { useRef, useState } from 'react'
import { clientEnv } from "../../lib/env/client-env"
import { getImageKitAuth } from '@/server/actions/ThirdParty/services/imagekit.service'

// ──────────────────────────────────────────────────────────────
// ImageUploader — direct-to-ImageKit uploads via HMAC auth
//
// Flow:
//   1. User selects a file
//   2. authenticator() calls getImageKitAuth() server function
//      → server computes HMAC signature (IMAGEKIT_PRIVATE_KEY never
//        leaves the server — this is the whole point of the server fn)
//   3. upload() sends file directly to ImageKit CDN with the signature
//   4. ImageKit validates the signature and stores the file
//
// This replaces the old /api/imagekit-auth Next.js API route with
// a createServerFn RPC call — same security, cleaner architecture.
// ──────────────────────────────────────────────────────────────

const ImageUploader = () => {
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch secure HMAC signature from our server (via TanStack Start server fn)
  const authenticator = async () => {
    const data = await getImageKitAuth()
    return data // { token, signature, expire }
  }

  const handleUpload = async () => {
    const fileInput = fileInputRef.current
    if (!fileInput?.files?.length) {
      alert('Please select a file to upload')
      return
    }

    const file = fileInput.files[0]
    abortControllerRef.current = new AbortController()

    setIsUploading(true)
    setUploadStatus('idle')
    setProgress(0)

    try {
      const authParams = await authenticator()

      const uploadResponse = await upload({
        file,
        fileName: file.name,
        token: authParams.token,
        signature: authParams.signature,
        expire: authParams.expire,
        publicKey: clientEnv.imagekitPublicKey,
        onProgress: (event) => {
          setProgress((event.loaded / event.total) * 100)
        },
        abortSignal: abortControllerRef.current.signal,
      })

      console.log('Upload response:', uploadResponse)
      setUploadStatus('success')
    } catch (error: unknown) {
      setUploadStatus('error')
      if (error instanceof ImageKitAbortError) {
        setErrorMessage('Upload cancelled')
      } else if (error instanceof ImageKitInvalidRequestError) {
        setErrorMessage(`Invalid request: ${error.message}`)
      } else if (error instanceof ImageKitUploadNetworkError) {
        setErrorMessage(`Network error: ${error.message}`)
      } else if (error instanceof ImageKitServerError) {
        setErrorMessage(`Server error: ${error.message}`)
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error')
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handleCancel = () => {
    abortControllerRef.current?.abort()
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
          disabled={isUploading}
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50"
        >
          {isUploading ? 'Uploading…' : 'Upload'}
        </button>
        {isUploading && (
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm text-red-500 hover:text-red-700 underline"
          >
            Cancel
          </button>
        )}
      </div>

      {isUploading && (
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs mb-1">
            <span>Uploading…</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {uploadStatus === 'success' && (
        <p className="text-emerald-600 text-sm font-medium">Upload successful ✓</p>
      )}
      {uploadStatus === 'error' && (
        <p className="text-red-600 text-sm font-medium">Failed: {errorMessage}</p>
      )}
    </div>
  )
}

export default ImageUploader
