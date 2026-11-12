<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { readFile, BaseDirectory } from "@tauri-apps/plugin-fs";
    import { rawHardware, lastUpdate, CONNECTION_TIMEOUT, isSensorless } from "#lib/stores/sensors.ts";
    import { settings } from "#lib/stores/settings.ts";
    import { themeRegistry } from "#lib/stores/themeStore.ts";
    import { formatUnit } from "#lib/utils.ts";
    import { loadGif, type GifData } from "#lib/gif_utils.ts";
    import { WifiOff, Loader2 } from "@lucide/svelte";
    import { isDoomModalOpen } from "#lib/stores/doomStore.ts";

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let frameId: number;

    let isSending = false;
    let tick = 0;
    let lastRenderTime = 0;
    let isOffline = false;
    let loadedAssets: Record<string, HTMLImageElement | GifData> = {};
    let activeObjectUrls: Record<string, string> = {};
    let assetsLoading: Set<string> = new Set();
    let renderErrorCount = 0;

    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;
    const OFFLINE_TIMEOUT = CONNECTION_TIMEOUT;
    const MAX_RENDER_ERRORS = 60; // Disable broken themes after ~2 seconds of consecutive errors
    const TICK_MODULO = 1_000_000; // Reset tick periodically to avoid overflow

    $: activeTheme = $themeRegistry.find(
        (t) => t.id === $settings.activeThemeId,
    );
    $: mapping = $settings.mappings[$settings.activeThemeId] || {};
    $: config = $settings.themeConfigs[$settings.activeThemeId] || {};

    // Safety: Ensure options exist
    $: effectiveConfig = activeTheme
        ? {
              ...activeTheme.options?.reduce(
                  (acc, opt) => ({ ...acc, [opt.id]: opt.default }),
                  {},
              ),
              ...config,
          }
        : {};

    $: fileAssetsToLoad =
        activeTheme?.options
            ?.filter((opt) => opt.type === "file")
            .map((opt) => ({
                id: opt.id,
                path: (effectiveConfig as any)[opt.id],
            })) || [];

    $: fileAssetsToLoad.forEach(({ id, path }) => {
        if (path) {
            loadAsset(id, path);
        } else {
            if (loadedAssets[id]) {
                // Revoke old object URL when clearing
                if (activeObjectUrls[id]) {
                    URL.revokeObjectURL(activeObjectUrls[id]);
                    delete activeObjectUrls[id];
                }
                delete loadedAssets[id];
                loadedAssets = loadedAssets;
            }
        }
    });

    async function loadAsset(id: string, path: string) {
        if (loadedAssets[id] && (loadedAssets[id] as any)._src === path) return;
        if (assetsLoading.has(`${id}:${path}`)) return;
        assetsLoading.add(`${id}:${path}`);

        try {
            // Revoke previous object URL for this asset
            if (activeObjectUrls[id]) {
                URL.revokeObjectURL(activeObjectUrls[id]);
                delete activeObjectUrls[id];
            }

            const fileBytes = await readFile(path, {
                baseDir: BaseDirectory.AppData,
            });
            const blob = new Blob([fileBytes]);
            const objectUrl = URL.createObjectURL(blob);
            activeObjectUrls[id] = objectUrl;

            if (path.toLowerCase().endsWith(".gif")) {
                const gifData = await loadGif(objectUrl);
                (gifData as any)._src = path;
                loadedAssets[id] = gifData;
            } else {
                const img = new Image();
                img.src = objectUrl;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                (img as any)._src = path;
                loadedAssets[id] = img;
            }
            loadedAssets = loadedAssets;
        } catch (e) {
            console.error("Failed to load asset:", path, e);
            if (activeObjectUrls[id]) {
                URL.revokeObjectURL(activeObjectUrls[id]);
                delete activeObjectUrls[id];
            }
            if (loadedAssets[id]) {
                delete loadedAssets[id];
                loadedAssets = loadedAssets;
            }
        } finally {
            assetsLoading.delete(`${id}:${path}`);
        }
    }

    function getData(hwList: any[]) {
        const values: Record<string, number> = {};
        const formatted: Record<string, string> = {};
        if (!activeTheme) return { values, formatted };

        // Safety: Ensure slots exist
        if (activeTheme.slots) {
            activeTheme.slots.forEach((slot) => {
                const map = mapping[slot.id];
                if (map) {
                    const hw = hwList.find((h: any) => h.Id === map.hwId);
                    const sensor = hw?.Sensors.find(
                        (s: any) => s.Id === map.sensorId,
                    );
                    if (sensor) {
                        values[slot.id] = sensor.Value;
                        formatted[slot.id] = formatUnit(
                            sensor.Value,
                            sensor.Type,
                        );
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
        isOffline = !$isSensorless && timeSinceUpdate > OFFLINE_TIMEOUT;

        if (!ctx || !canvas || !activeTheme) return;

        const w = canvas.width;
        const h = canvas.height;
        const { values, formatted } = getData($rawHardware);
        tick = (tick + 1) % TICK_MODULO;

        drawAndSend(w, h, values, formatted, tick);
    }

    async function drawAndSend(
        w: number,
        h: number,
        values: any,
        formatted: any,
        currentTick: number,
    ) {
        try {
            if (activeTheme?.renderFn) {
                if (renderErrorCount >= MAX_RENDER_ERRORS) {
                    // Theme is broken — draw error message instead of calling renderFn
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = '#ef4444';
                    ctx.font = 'bold 20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('Theme Error', w / 2, h / 2 - 15);
                    ctx.fillStyle = '#71717a';
                    ctx.font = '14px Arial';
                    ctx.fillText('Switch themes to recover', w / 2, h / 2 + 15);
                } else {
                    const renderResult = activeTheme.renderFn(
                        ctx,
                        w,
                        h,
                        values,
                        formatted,
                        effectiveConfig,
                        currentTick,
                        loadedAssets,
                    );

                    if (renderResult && typeof renderResult.then === "function") {
                        await renderResult;
                    }
                    // Reset error count on successful render
                    renderErrorCount = 0;
                }
            }
        } catch (e) {
            renderErrorCount++;
            if (renderErrorCount <= 3) {
                console.error("Render Error:", e);
            } else if (renderErrorCount === MAX_RENDER_ERRORS) {
                console.error(`Render Error: Theme disabled after ${MAX_RENDER_ERRORS} consecutive failures`);
            }
        }

        if (!isSending && !isOffline && !$isDoomModalOpen) {
            isSending = true;
            canvas.toBlob(
                async (blob) => {
                    if (blob) {
                        try {
                            const buffer = await blob.arrayBuffer();
                            await invoke("send_frame", {
                                jpegData: new Uint8Array(buffer),
                            });
                        } catch (e) {}
                    }
                    isSending = false;
                },
                "image/jpeg",
                0.9,
            );
        }
    }

    // Reset render error count when theme changes
    $: if (activeTheme) {
        renderErrorCount = 0;
    }

    onMount(() => {
        if (canvas) {
            ctx = canvas.getContext("2d", { alpha: false })!;
            frameId = requestAnimationFrame(loop);
        }
    });

    onDestroy(() => {
        cancelAnimationFrame(frameId);
        // Revoke all tracked object URLs
        for (const url of Object.values(activeObjectUrls)) {
            URL.revokeObjectURL(url);
        }
        activeObjectUrls = {};
    });
</script>

<div
    class="relative w-full h-full group select-none flex items-center justify-center"
>
    <canvas
        bind:this={canvas}
        width={480}
        height={480}
        class="w-full h-full object-contain block"
        style="image-rendering: -webkit-optimize-contrast;"
    ></canvas>

    {#if isOffline}
        <div
            class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500"
        >
            <div class="p-4 rounded-full bg-red-500/10 mb-4 animate-pulse">
                <WifiOff size={40} class="text-red-500" />
            </div>
            <h3 class="text-xl font-bold text-white tracking-widest">
                NO SIGNAL
            </h3>
            <p class="text-xs text-zinc-500 mt-2 uppercase font-medium">
                Waiting for sensor bridge...
            </p>
        </div>
    {/if}

    {#if !activeTheme && !isOffline}
        <div
            class="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-900"
        >
            <Loader2 size={32} class="text-indigo-500 animate-spin mb-2" />
            <span class="text-xs text-zinc-500 uppercase font-widest"
                >Loading Theme...</span
            >
        </div>
    {/if}
</div>
