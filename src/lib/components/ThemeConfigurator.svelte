<script lang="ts">
    import { settings } from "#lib/stores/settings.ts";
    import { themeRegistry } from "#lib/stores/themeStore.ts";
    import CanvasRenderer from "#lib/components/CanvasRenderer.svelte";
    import ConfirmationModal from "#lib/components/ConfirmationModal.svelte";
    import DataTab from "#lib/components/theme/DataTab.svelte";
    import StyleTab from "#lib/components/theme/StyleTab.svelte";
    import {
        Activity,
        Palette,
        MousePointer2,
        RotateCcw,
        X,
    } from "@lucide/svelte";
    import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
    import { slide } from "svelte/transition";
    import type { ThemeOption } from "#lib/types.ts";

    let activeTab: "data" | "style" = "data";
    let isDragging = false;
    let showResetModal = false;

    $: activeTheme = $themeRegistry.find(
        (t) => t.id === $settings.activeThemeId,
    );
    $: config = $settings.themeConfigs[$settings.activeThemeId] || {};

    $: supportsPanZoom =
        activeTheme?.options?.some((o) => o.id === "panX") &&
        activeTheme?.options?.some((o) => o.id === "zoom");

    function handleWheel(e: WheelEvent) {
        if (!supportsPanZoom || !activeTheme) return;
        e.preventDefault();
        const zoomOpt = activeTheme.options?.find((o) => o.id === "zoom");
        if (!zoomOpt) return;

        const min = zoomOpt.min || 10;
        const max = zoomOpt.max || 500;
        const currentZoom = config["zoom"] ?? 100;
        let newZoom = Math.min(
            Math.max(currentZoom + -e.deltaY * 0.1, min),
            max,
        );
        settings.updateThemeConfig(activeTheme.id, "zoom", newZoom);
    }

    function handleMouseDown(e: MouseEvent) {
        if (supportsPanZoom && e.button === 0) isDragging = true;
    }
    function handleMouseUp() {
        isDragging = false;
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isDragging || !activeTheme) return;
        settings.updateThemeConfig(
            activeTheme.id,
            "panX",
            (config["panX"] ?? 0) + e.movementX,
        );
        settings.updateThemeConfig(
            activeTheme.id,
            "panY",
            (config["panY"] ?? 0) + e.movementY,
        );
    }

    async function confirmResetAll() {
        if (activeTheme && activeTheme.options) {
            for (const opt of activeTheme.options) {
                if (opt.type === "file") {
                    const pathToDelete = config[opt.id];
                    if (pathToDelete && typeof pathToDelete === "string") {
                        try {
                            await remove(pathToDelete, {
                                baseDir: BaseDirectory.AppData,
                            });
                        } catch (e) {}
                    }
                }
            }

            settings.resetThemeConfig(activeTheme.id);
        }
        showResetModal = false;
    }
</script>

<svelte:window on:mouseup={handleMouseUp} />

{#if showResetModal}
    <ConfirmationModal
        title="Reset Theme?"
        message="This will revert all colors, fonts, and files for this theme to their defaults. Data mappings will be kept."
        confirmText="Reset All"
        variant="info"
        on:cancel={() => (showResetModal = false)}
        on:confirm={confirmResetAll}
    />
{/if}

<div class="flex h-full w-full overflow-hidden">
    <!-- Left: Preview Canvas -->
    <div
        class="flex-1 flex flex-col min-w-0 bg-zinc-950 relative overflow-hidden"
    >
        <!-- Ambient Background Spotlights -->
        <div
            class="absolute top-[-50%] left-[-20%] w-[80%] h-[80%] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen opacity-70"
        ></div>
        <div
            class="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-900/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen opacity-60"
        ></div>
        <div
            class="h-20 flex items-start justify-between px-8 py-6 z-20 shrink-0"
        >
            <div class="min-w-0">
                <h1 class="text-xl font-bold text-white truncate">
                    {activeTheme?.name || "..."}
                </h1>
                <p class="text-xs text-zinc-400">
                    {activeTheme?.description || ""}
                </p>
            </div>

            <div class="flex items-center gap-4">
                {#if supportsPanZoom}
                    <div
                        class="hidden md:flex items-center gap-2 text-[10px] text-zinc-500 bg-black/40 px-3 py-1.5 rounded-full border border-white/5"
                    >
                        <MousePointer2 size={12} />
                        <span>SCROLL / DRAG</span>
                    </div>
                {/if}

                <div
                    class="flex bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/10 shadow-xl"
                >
                    <button
                        on:click={() => (activeTab = "data")}
                        class="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 {activeTab ===
                        'data'
                            ? 'bg-indigo-500 text-white shadow-[0_0_15px_-3px_rgba(99,102,241,0.5)]'
                            : 'text-zinc-500 hover:text-zinc-300'}"
                    >
                        <Activity size={14} /> Data
                    </button>
                    <button
                        on:click={() => (activeTab = "style")}
                        class="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 {activeTab ===
                        'style'
                            ? 'bg-indigo-500 text-white shadow-[0_0_15px_-3px_rgba(99,102,241,0.5)]'
                            : 'text-zinc-500 hover:text-zinc-300'}"
                    >
                        <Palette size={14} /> Style
                    </button>
                </div>
            </div>
        </div>

        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
            class="flex-1 flex items-center justify-center p-4 md:p-8 min-h-0 relative overflow-hidden"
            role="application"
            on:wheel|nonpassive={handleWheel}
            on:mousedown={handleMouseDown}
            on:mousemove={handleMouseMove}
            style:cursor={supportsPanZoom
                ? isDragging
                    ? "grabbing"
                    : "grab"
                : "default"}
        >
            <div
                class="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent opacity-50 pointer-events-none"
            ></div>

            <div
                class="relative w-full max-w-[65vh] aspect-square max-h-full pointer-events-none group transition-all duration-300 ease-out"
            >
                <div
                    class="w-full h-full rounded-full ring-4 md:ring-8 ring-black shadow-2xl bg-black relative overflow-hidden"
                >
                    <CanvasRenderer />
                </div>
                <div
                    class="absolute inset-0 rounded-full bg-gradient-to-tr from-white/5 to-transparent"
                ></div>
            </div>
        </div>
    </div>

    <!-- Right: Controls -->
    <div
        class="w-[300px] lg:w-[360px] xl:w-[400px] border-l border-white/5 bg-zinc-900/80 backdrop-blur-xl flex flex-col shadow-2xl z-20 shrink-0 transition-all duration-300"
    >
        {#if activeTab === "data"}
            <DataTab {activeTheme} />
        {:else if activeTab === "style"}
            <StyleTab
                {activeTheme}
                on:requestReset={() => (showResetModal = true)}
            />
        {/if}
    </div>
</div>
