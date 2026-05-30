import { clientEnv } from '@/lib/client-env';
import {
    ImageKitAbortError,
    ImageKitInvalidRequestError,
    ImageKitServerError,
    ImageKitUploadNetworkError,
    upload,
} from "@imagekit/react";
import { useRef, useState } from "react";

const ImageUploader = () => {
    const [progress, setProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortController = new AbortController();

    // 1. Fetch the secure signature from your backend
    const authenticator = async () => {
        try {
            const response = await fetch("/api/imagekit-auth");
            if (!response.ok) throw new Error("Failed to fetch auth parameters");

            const data = await response.json();
            return data; // Returns { token, signature, expire }
        } catch (error) {
            console.error("Authentication error:", error);
            throw new Error("Authentication request failed");
        }
    };

    const handleUpload = async () => {
        const fileInput = fileInputRef.current;
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            alert("Please select a file to upload");
            return;
        }

        const file = fileInput.files[0];

        setIsUploading(true);
        setUploadStatus("idle");
        setProgress(0);

        try {
            // 2. Wait for the authenticator to give you the secure parameters
            const authParams = await authenticator();

            // 3. Pass EVERYTHING into the upload function
            const uploadResponse = await upload({
                file,
                fileName: file.name,

                // Required Authentication Parameters
                token: authParams.token,
                signature: authParams.signature,
                expire: authParams.expire,
                publicKey: clientEnv.imagekitPublicKey,

                onProgress: (event) => {
                    setProgress((event.loaded / event.total) * 100);
                },
                abortSignal: abortController.signal,
            });
            console.log("Upload response:", uploadResponse);
            setUploadStatus("success");
        } catch (error: unknown) {
            setUploadStatus("error");
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "An unknown error occurred during upload.",
            );

            if (error instanceof ImageKitAbortError) {
                console.error("Upload aborted:", error.reason);
            } else if (error instanceof ImageKitInvalidRequestError) {
                console.error("Invalid request:", error.message);
            } else if (error instanceof ImageKitUploadNetworkError) {
                console.error("Network error:", error.message);
            } else if (error instanceof ImageKitServerError) {
                console.error("Server error:", error.message);
            } else {
                console.error("Upload error:", error);
            }
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    disabled={isUploading}
                />
                <button
                    type="button"
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50"
                >
                    {isUploading ? "Uploading..." : "Upload file"}
                </button>
            </div>

            {isUploading && (
                <div className="w-full max-w-xs">
                    <div className="flex justify-between text-xs mb-1">
                        <span>Uploading...</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <progress className="w-full" value={progress} max={100}></progress>
                </div>
            )}

            {uploadStatus === "success" && (
                <p className="text-green-600 text-sm font-medium">Upload successful! ✅</p>
            )}

            {uploadStatus === "error" && (
                <p className="text-red-600 text-sm font-medium">Upload failed: {errorMessage}</p>
            )}
        </div>
    );
};

export default ImageUploader;