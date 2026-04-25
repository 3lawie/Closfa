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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortController = new AbortController();

    // 1. Fetch the secure signature from your backend
    const authenticator = async () => {
        try {
            const response = await fetch("http://localhost:3000/api/imagekit-auth");
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
                publicKey: "your_public_api_key_here", // Safe to expose in React
                urlEndpoint: "https://ik.imagekit.io/your_id",

                onProgress: (event) => {
                    setProgress((event.loaded / event.total) * 100);
                },
                abortSignal: abortController.signal,
            });
            console.log("Upload response:", uploadResponse);
        } catch (error) {
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
        }
    };

    return (
        <>
            <input type="file" ref={fileInputRef} />
            <button type="button" onClick={handleUpload}>Upload file</button>
            <br />
            Upload progress: <progress value={progress} max={100}></progress>
        </>
    );
};

export default ImageUploader;