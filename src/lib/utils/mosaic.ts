export type MosaicSpan = {
    colSpan: number;
    rowSpan: number;
    isTiny: boolean;
};

/**
 * Calculates the appropriate grid column and row spans for a media file
 * based on its aspect ratio to create a dynamic mosaic/masonry layout.
 *
 * @param width Original width of the media
 * @param height Original height of the media
 * @param maxCols The maximum number of columns the grid currently supports (e.g. based on screen size)
 * @returns {MosaicSpan} The recommended col and row span
 */
export function calculateMosaicSpan(width?: number, height?: number, maxCols: number = 3): MosaicSpan {
    // Default to square if dimensions are missing
    if (!width || !height) {
        return { colSpan: 1, rowSpan: 1, isTiny: false };
    }

    const aspectRatio = width / height;
    const isTiny = width < 300 && height < 300;

    let colSpan = 1;
    let rowSpan = 1;

    if (aspectRatio < 0.6) {
        // Extra Tall
        colSpan = 1;
        rowSpan = 3;
    } else if (aspectRatio >= 0.6 && aspectRatio < 0.85) {
        // Tall / Portrait
        colSpan = 1;
        rowSpan = 2;
    } else if (aspectRatio >= 0.85 && aspectRatio < 1.2) {
        // Square / Normal
        colSpan = 1;
        rowSpan = 1;
    } else if (aspectRatio >= 1.2 && aspectRatio < 1.8) {
        // Wide / Landscape
        colSpan = 2;
        rowSpan = 1;
    } else {
        // Extra Wide / Panorama
        colSpan = 3;
        rowSpan = 1;
    }

    // Ensure we don't return a colSpan greater than the grid's max columns
    // (e.g., if the screen is mobile and only has 1 column, everything should span 1 col max)
    if (colSpan > maxCols) {
        colSpan = maxCols;
    }

    return { colSpan, rowSpan, isTiny };
}
