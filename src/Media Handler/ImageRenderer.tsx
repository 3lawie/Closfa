import { useQuery } from '@tanstack/react-query';
import { useRef, useState, useEffect } from 'react';

import { clientEnv } from '@/lib/client-env';

const IMAGEKIT_URL = clientEnv.imagekitUrlEndpoint;

// ──────────────────────────────────────────────────────────────
// APPROACH 1: Blob (commented out)
// Downloads the full image into browser memory as a Blob object.
// ⚠️ Heavy on memory — each image (~30-80KB) stays cached in RAM.
// ⚠️ Must call URL.revokeObjectURL() to avoid memory leaks.
// Good for: learning, offline caching, canvas manipulation.
// ──────────────────────────────────────────────────────────────
//
// async function fetchImageAsBlob(imagePath: string) {
//   const url = `${IMAGEKIT_URL}/tr:w-500,h-500,f-avif/${imagePath}`;
//   const response = await fetch(url);
//   if (!response.ok) throw new Error(`Failed to load image: ${response.status}`);
//
//   // response.blob() reads the entire image body into memory
//   const blob = await response.blob();
//   // blob = Blob { size: 48532, type: "image/avif" }
//
//   // URL.createObjectURL() creates a temporary local URL pointing to that blob
//   // e.g. "blob:http://localhost:5173/3a4b5c6d-7e8f-..."
//   return URL.createObjectURL(blob);
// }
//
// Usage in useQuery:
// const { data: blobUrl } = useQuery({
//   queryKey: ['image', imageSource],
//   queryFn: () => fetchImageAsBlob(imageSource),
//   staleTime: 1000 * 60 * 30,
// });
// Then: <img src={blobUrl} />

// ──────────────────────────────────────────────────────────────
// APPROACH 2: Two-phase loading (active)
// Phase 1 (on mount): HEAD request for metadata — lightweight, immediate.
// Phase 2 (on visible): Load image dimensions — deferred until in viewport.
// ──────────────────────────────────────────────────────────────

// PHASE 1: Lightweight HEAD check — runs immediately on mount
async function fetchImageMeta(imagePath: string) {
  // Display URL: has size transforms for optimized rendering
  const displayUrl = `${IMAGEKIT_URL}/tr:w-500,h-500,f-avif/${imagePath}`;
  // Original URL: NO size transforms — used to read true original dimensions
  const originalUrl = `${IMAGEKIT_URL}/${imagePath}`;

  const response = await fetch(displayUrl, { method: 'HEAD' });
  if (!response.ok) throw new Error(`Image not found: ${response.status}`);

  return {
    displayUrl,      // for <img src> — optimized 500×500
    originalUrl,     // for getImageDimensions() — true original size
    contentType: response.headers.get('content-type'),
    size: response.headers.get('content-length'),
  };
}

// PHASE 2: Load ORIGINAL image to read true dimensions — only when visible
// Uses originalUrl (no size transforms) so naturalWidth/Height = real dimensions
function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image for dimensions'));
    img.src = url;
  });
}

// ──────────────────────────────────────────────────────────────
// Custom hook: tracks when an element scrolls into view
// ──────────────────────────────────────────────────────────────
function useIsVisible() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Only need to trigger once
        }
      },
      { threshold: 0.1 } // Fires when 10% of the element is visible
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

export default function ImageRenderer({ imageSource = "default-image.jpg" }) {
  const { ref, isVisible } = useIsVisible();

  // QUERY 1: Runs immediately on mount — just a HEAD request (~0 bytes downloaded)
  const meta = useQuery({
    queryKey: ['image-meta', imageSource],
    queryFn: () => fetchImageMeta(imageSource),
    staleTime: 1000 * 60 * 30,
  });

  // QUERY 2: Runs only when the element is visible in the viewport
  // `enabled: isVisible && !!meta.data` — won't fire until both conditions are true
  const dimensions = useQuery({
    queryKey: ['image-dimensions', imageSource],
    queryFn: () => getImageDimensions(meta.data!.originalUrl),  // ← uses raw URL, no transforms
    enabled: isVisible && !!meta.data,   // ← deferred until visible + meta ready
    staleTime: 1000 * 60 * 30,
  });

  // Phase 1 still loading
  if (meta.isLoading) {
    return (
      <div ref={ref} className="w-[500px] h-[500px] rounded-xl bg-gray-200 animate-pulse flex items-center justify-center">
        <span className="text-gray-400 text-sm">Checking image…</span>
      </div>
    );
  }

  if (meta.isError) {
    return (
      <div className="w-[500px] h-[500px] rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
        <span className="text-red-400 text-sm">Failed to load: {meta.error.message}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <img
        src={meta.data!.originalUrl}
        alt="Picture of the author"
        loading="lazy"
        className="rounded-xl object-cover"
        width={500}
        height={500}
      />
      {/* Show dimensions once phase 2 completes */}
      {dimensions.data && (
        <p className="text-xs text-gray-400">
          Original: {dimensions.data.width}×{dimensions.data.height}
          {' · '}
          Ratio: {(dimensions.data.width / dimensions.data.height).toFixed(2)}
          {' · '}
          Display: 500×500
          {' · '}
          {meta.data!.contentType}
          {' · '}
          {Math.round(Number(meta.data!.size) / 1024)}KB
        </p>
      )}
    </div>
  );
}