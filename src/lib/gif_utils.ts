import { parseGIF, decompressFrames } from 'gifuct-js';

export interface GifData {
    frames: {
        delay: number;
        image: ImageData;
    }[];
    totalTime: number;
    width: number;
    height: number;
}

// Single, reliable JS-based loader. No more fallback logic.
export async function loadGif(url: string): Promise<GifData> {
    console.log('[GIF Loader] Using JS Parser (gifuct-js)');

    const resp = await fetch(url);
    const buffer = await resp.arrayBuffer();
    
    // Safety: Prevent crash on >50MB GIFs
    if (buffer.byteLength > 50 * 1024 * 1024) {
        throw new Error("GIF file is too large (Max 50MB)");
    }
    
    const gif = parseGIF(buffer);
    const rawFrames = decompressFrames(gif, true);

    if (!rawFrames || rawFrames.length === 0) throw new Error("No frames found in GIF");

    // Get logical screen dimensions from GIF header
    const gifWidth = gif.lsd.width;
    const gifHeight = gif.lsd.height;

    // Auto-Downscale
    const MAX_SIZE = 480;
    const scale = Math.min(1, MAX_SIZE / gifWidth, MAX_SIZE / gifHeight);
    const targetWidth = Math.floor(gifWidth * scale);
    const targetHeight = Math.floor(gifHeight * scale);

    // Canvas for final composition at full resolution
    const compCanvas = document.createElement('canvas');
    compCanvas.width = gifWidth;
    compCanvas.height = gifHeight;
    const compCtx = compCanvas.getContext('2d', { willReadFrequently: true });

    // Canvas for final resized output
    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetWidth;
    outCanvas.height = targetHeight;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
    
    if (!compCtx || !outCtx) throw new Error("Canvas init failed");

    const processedFrames: { delay: number; image: ImageBitmap }[] = [];
    let totalTime = 0;
    let backupFrameData: ImageData | null = null;

    // --- The Correct Compositing Loop ---
    for (const frame of rawFrames) {
        const dims = frame.dims;

        // Disposal 3: Save state BEFORE drawing
        if (frame.disposalType === 3 && compCtx.getImageData) {
            backupFrameData = compCtx.getImageData(0, 0, gifWidth, gifHeight);
        }

        // CRITICAL FIX: Create an ImageBitmap from the patch data first.
        // This is the correct way to handle raw pixel arrays for drawing.
        const patchBitmap = await createImageBitmap(new ImageData(frame.patch, dims.width, dims.height));

        // Draw the patch bitmap onto the main composition canvas
        compCtx.drawImage(patchBitmap, dims.left, dims.top);

        // Snapshot the COMPOSITE frame and resize it
        outCtx.clearRect(0, 0, targetWidth, targetHeight);
        outCtx.drawImage(compCanvas, 0, 0, targetWidth, targetHeight);
        
        // Store the final, resized bitmap
        const finalImageData = outCtx.getImageData(0, 0, targetWidth, targetHeight);
        
        const safeDelay = Math.max(frame.delay, 30);
        processedFrames.push({ delay: safeDelay, image: finalImageData });
        totalTime += safeDelay;

        // Handle Disposal for NEXT frame
        if (frame.disposalType === 2) {
            // Clear the area of the last patch
            compCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
        } else if (frame.disposalType === 3 && backupFrameData) {
            // Restore to the saved state
            compCtx.putImageData(backupFrameData, 0, 0);
        }
        // Disposal 1 or 0: Do nothing, keep the frame as is.
    }

    console.log(`[GIF Loader] Succeeded. Parsed ${processedFrames.length} frames.`);
    return { 
        frames: processedFrames, 
        totalTime,
        width: targetWidth,
        height: targetHeight
    };
}