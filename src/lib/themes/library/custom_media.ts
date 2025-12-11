import type { ThemeDefinition } from '../types';
import type { GifData } from '$lib/gif_utils';

export const theme: ThemeDefinition = {
    id: 'custom-media',
    name: 'Custom Media',
    author: 'User Library',
    description: 'Display images or GIFs with Pan and Zoom controls.',
    slots: [
        { id: 'overlay', label: 'Overlay Sensor', type: 'number', allowedTypes: undefined }
    ],
    options: [
        { id: 'source', label: 'Image/GIF File', type: 'file', default: null },
        { id: 'zoom', label: 'Zoom (%)', type: 'range', default: 100, min: 10, max: 300 },
        { id: 'panX', label: 'Pan Horizontal', type: 'range', default: 0, min: -240, max: 240 },
        { id: 'panY', label: 'Pan Vertical', type: 'range', default: 0, min: -240, max: 240 },
        { id: 'showText', label: 'Show Overlay', type: 'boolean', default: true },
        { id: 'overlayLabel', label: 'Overlay Text', type: 'text', default: '' },
        { id: 'textColor', label: 'Text Color', type: 'color', default: '#ffffff' },
        { id: 'textFont', label: 'Font Family', type: 'font', default: 'Arial' },
        { id: 'fontSize', label: 'Font Size', type: 'range', default: 80, min: 20, max: 200 }
    ],
    renderFn: async (ctx, w, h, values, formatted, config, tick, assets) => {
        const asset = assets['source'];
        const zoom = (config.zoom ?? 100) / 100;
        const panX = config.panX ?? 0;
        const panY = config.panY ?? 0;
        const font = config.textFont || 'Arial';
        const size = config.fontSize || 80;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        let imgToDraw: HTMLImageElement | ImageBitmap | null = null;

        if (asset) {
            if (asset instanceof HTMLImageElement) {
                imgToDraw = asset;
            } 
            else if ((asset as any).frames) {
                const gif = asset as GifData;

                const frameTick = 33.33;
                const totalTime = gif.totalTime || 1000;
                const currentTime = (tick * frameTick) % totalTime;

                let timeAccumulator = 0;

                for (let f of gif.frames) {
                    timeAccumulator += f.delay;

                    if (timeAccumulator >= currentTime) {
                        if (f.image instanceof ImageData) {
                            imgToDraw = await createImageBitmap(f.image);
                        } else {
                            imgToDraw = f.image;
                        }
                        break;
                    }
                }
            }

            if (imgToDraw) {
                const imgW = imgToDraw.width;
                const imgH = imgToDraw.height;

                const scaleW = w / imgW;
                const scaleH = h / imgH;
                const baseScale = Math.max(scaleW, scaleH);

                const finalScale = baseScale * zoom;

                const drawW = imgW * finalScale;
                const drawH = imgH * finalScale;

                const drawX = w / 2 - drawW / 2 + panX;
                const drawY = h / 2 - drawH / 2 + panY;

                ctx.drawImage(imgToDraw, drawX, drawY, drawW, drawH);
            }

        } else {
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 30px Arial';
            ctx.fillText("SELECT FILE IN SETTINGS", w/2, h/2);
        }

        if (config.showText) {
            const str = formatted['overlay'] || '';
            const label = config.overlayLabel || '';

            if (str && str !== '--') {
                ctx.fillStyle = config.textColor;
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                ctx.font = `bold ${size}px "${font}"`;
                ctx.fillText(str, w/2, h - size);
                
                ctx.font = `bold ${Math.max(12, size/4)}px "${font}"`;
                ctx.fillText(label.toUpperCase(), w/2, h - (size/2));
                
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
        }
    }
};
