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
        { id: 'textColor', label: 'Text Color', type: 'color', default: '#ffffff' }
    ],
    renderFn: (ctx, w, h, values, formatted, config, tick, assets) => {
        const asset = assets['source'];
        const zoom = (config.zoom ?? 100) / 100;
        const panX = config.panX ?? 0;
        const panY = config.panY ?? 0;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        if (asset) {
            let imgToDraw: HTMLImageElement | ImageBitmap | null = null;

            if (asset instanceof HTMLImageElement) {
                imgToDraw = asset;
            } 
            else if ((asset as any).frames) {
                const gif = asset as GifData;
                const ms = tick * 33; 
                const loopTime = ms % gif.totalTime;
                
                let currentT = 0;
                for(let f of gif.frames) {
                    currentT += f.delay;
                    if (currentT >= loopTime) {
                        if(f.imageBitmap) imgToDraw = f.imageBitmap;
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

                const centerX = w / 2;
                const centerY = h / 2;
                
                const drawX = centerX - (drawW / 2) + panX;
                const drawY = centerY - (drawH / 2) + panY;

                ctx.drawImage(imgToDraw, drawX, drawY, drawW, drawH);
            }
        } else {
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 20px Inter';
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
                
                ctx.font = 'bold 80px Inter';
                ctx.fillText(str, w/2, h - 80);
                
                ctx.font = 'bold 20px Inter';
                ctx.fillText(label.toUpperCase(), w/2, h - 40);
                
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
        }
    }
};