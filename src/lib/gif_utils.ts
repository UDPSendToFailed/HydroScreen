import { parseGIF, decompressFrames } from 'gifuct-js';

export interface GifData {
    frames: {
        dims: { width: number; height: number; top: number; left: number };
        delay: number;
        patch: Uint8ClampedArray;
        imageBitmap?: ImageBitmap;
    }[];
    totalTime: number;
}

export async function loadGif(url: string): Promise<GifData> {
    const resp = await fetch(url);
    const buffer = await resp.arrayBuffer();
    const gif = parseGIF(buffer);
    const frames = decompressFrames(gif, true);

    const processedFrames = await Promise.all(frames.map(async (frame) => {
        const imageData = new ImageData(frame.patch, frame.dims.width, frame.dims.height);
        const imageBitmap = await createImageBitmap(imageData);
        return {
            dims: frame.dims,
            delay: frame.delay,
            patch: frame.patch,
            imageBitmap
        };
    }));

    const totalTime = processedFrames.reduce((acc, f) => acc + f.delay, 0);

    return { frames: processedFrames, totalTime };
}