<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { readFile } from '@tauri-apps/plugin-fs';
    import { rawHardware, lastUpdate } from '$lib/stores/sensors';
    import { settings } from '$lib/stores/settings';
    import { themeRegistry } from '$lib/stores/themeStore';
    import { formatUnit } from '$lib/utils';
    import { loadGif, type GifData } from '$lib/gif_utils';
    import { WifiOff, Loader2 } from 'lucide-svelte';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let frameId: number;
    
    let isSending = false;
    let tick = 0; 
    let lastRenderTime = 0;
    let isOffline = false;
    let loadedAssets: Record<string, HTMLImageElement | GifData> = {};

    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS; 
    const OFFLINE_TIMEOUT = 2500;

    $: activeTheme = $themeRegistry.find(t => t.id === $settings.activeThemeId);
    $: mapping = $settings.mappings[$settings.activeThemeId] || {};
    $: config = $settings.themeConfigs[$settings.activeThemeId] || {};

    // Safety: Ensure options exist
    $: effectiveConfig = activeTheme ? {
        ...activeTheme.options?.reduce((acc, opt) => ({...acc, [opt.id]: opt.default}), {}),
        ...config
    } : {};

    $: if (activeTheme && effectiveConfig && activeTheme.options) {
        activeTheme.options.forEach(opt => {
            if (opt.type === 'file') {
                const path = effectiveConfig[opt.id];
                if (path) {
                    loadAsset(opt.id, path);
                } else {
                    if (loadedAssets[opt.id]) {
                        delete loadedAssets[opt.id];
                        loadedAssets = loadedAssets; // Trigger reactivity
                    }
                }
            }
        });
    }

    async function loadAsset(id: string, path: string) {
        if (loadedAssets[id] && (loadedAssets[id] as any)._src === path) return;
        
        try {
            const fileBytes = await readFile(path);
            const blob = new Blob([fileBytes]);
            const objectUrl = URL.createObjectURL(blob);
            
            if (path.toLowerCase().endsWith('.gif')) {
                const gifData = await loadGif(objectUrl);
                (gifData as any)._src = path;
                loadedAssets[id] = gifData;
            } else {
                const img = new Image();
                img.src = objectUrl;
                await new Promise((resolve) => img.onload = resolve);
                (img as any)._src = path;
                loadedAssets[id] = img;
            }
            loadedAssets = loadedAssets; 
        } catch (e) { 
            if (loadedAssets[id]) {
                delete loadedAssets[id];
                loadedAssets = loadedAssets;
            }
        }
    }

    function getData(hwList: any[]) {
        const values: Record<string, number> = {};
        const formatted: Record<string, string> = {};
        if (!activeTheme) return { values, formatted };
        
        // Safety: Ensure slots exist
        if (activeTheme.slots) {
            activeTheme.slots.forEach(slot => {
                const map = mapping[slot.id];
                if (map) {
                    const hw = hwList.find((h:any) => h.Id === map.hwId);
                    const sensor = hw?.Sensors.find((s: any) => s.Id === map.sensorId);
                    if (sensor) {
                        values[slot.id] = sensor.Value;
                        formatted[slot.id] = formatUnit(sensor.Value, sensor.Type);
                    }
                }
            });
        }
        return { values, formatted };
    }

    function loop(now: number) {
        frameId = requestAnimationFrame(loop);

        const elapsed = now - lastRenderTime;
        if (elapsed < FRAME_INTERVAL) return;
        lastRenderTime = now - (elapsed % FRAME_INTERVAL);

        const timeSinceUpdate = Date.now() - $lastUpdate;
        isOffline = timeSinceUpdate > OFFLINE_TIMEOUT;

        if (!ctx || !canvas || !activeTheme) return;

        const w = canvas.width;
        const h = canvas.height;
        const { values, formatted } = getData($rawHardware);
        tick++; 

        try {
            if (activeTheme.renderFn) {
                activeTheme.renderFn(ctx, w, h, values, formatted, effectiveConfig, tick, loadedAssets);
            }
        } catch (e) { console.error("Render Error:", e); }

        if (!isSending && !isOffline) {
            isSending = true;
            canvas.toBlob(async (blob) => {
                if (blob) {
                    try {
                        const buffer = await blob.arrayBuffer();
                        await invoke('send_frame', { jpegData: new Uint8Array(buffer) });
                    } catch (e) { }
                }
                isSending = false;
            }, 'image/jpeg', 0.90);
        }
    }

    onMount(() => {
        if(canvas) {
            ctx = canvas.getContext('2d', { alpha: false })!;
            frameId = requestAnimationFrame(loop);
        }
    });

    onDestroy(() => cancelAnimationFrame(frameId));
</script>

<div class="relative w-full h-full group select-none flex items-center justify-center">
    <canvas 
        bind:this={canvas} 
        width={480} 
        height={480} 
        class="w-full h-full object-contain block"
        style="image-rendering: -webkit-optimize-contrast;"
    ></canvas>
    
    {#if isOffline}
        <div class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500">
            <div class="p-4 rounded-full bg-red-500/10 mb-4 animate-pulse">
                <WifiOff size={40} class="text-red-500" />
            </div>
            <h3 class="text-xl font-bold text-white tracking-widest">NO SIGNAL</h3>
            <p class="text-xs text-zinc-500 mt-2 uppercase font-medium">Waiting for sensor bridge...</p>
        </div>
    {/if}

    {#if !activeTheme && !isOffline}
        <div class="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-900">
            <Loader2 size={32} class="text-indigo-500 animate-spin mb-2" />
            <span class="text-xs text-zinc-500 uppercase tracking-widest">Loading Theme...</span>
        </div>
    {/if}
</div>