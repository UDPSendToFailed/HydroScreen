<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { settings } from "#lib/stores/settings.ts";
    import { getVersion } from "@tauri-apps/api/app";
    import { X, Power, ArrowDownToLine, Monitor, EyeOff, Sun, RotateCw } from "@lucide/svelte";

    const dispatch = createEventDispatcher();
    let version = "";
    let modalElement: HTMLDivElement;

    onMount(async () => {
        try {
            version = await getVersion();
        } catch (e) {
            console.error("Failed to get version", e);
            version = "Unknown";
        }
        // Focus the modal on mount for keyboard accessibility
        modalElement?.focus();
    });

    function close() {
        dispatch("close");
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") close();
        // Focus trap: keep Tab within the modal
        if (e.key === "Tab") {
            const focusable = modalElement?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    const brightnessValues = [0, 33, 66, 100];
    $: brightnessIndex = brightnessValues.indexOf($settings.lcdConfig?.brightness ?? 100);

    function handleBrightnessChange(e: Event) {
        const index = parseInt((e.target as HTMLInputElement).value);
        const val = brightnessValues[index];
        settings.updateLcdBrightness(val);
    }

    function handleRotationChange(angle: number) {
        settings.updateLcdRotation(angle);
    }
</script>

<!-- Backdrop -->
<div
    class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 outline-none"
    transition:fade={{ duration: 200 }}
    on:click|self={close}
    on:keydown={handleKeydown}
    role="presentation"
>
    <!-- Modal Content -->
    <div
        class="glass-modal w-full max-w-md"
        transition:scale={{ duration: 200, start: 0.95 }}
        role="dialog"
        aria-modal="true"
        aria-label="Application Settings"
        tabindex="-1"
        bind:this={modalElement}
    >
        <div
            class="p-6 border-b border-white/5 flex items-center justify-between bg-white/5"
        >
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
                <Monitor size={18} class="text-indigo-500" />
                Application Settings
            </h2>
            <button
                on:click={close}
                class="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
                <X size={18} />
            </button>
        </div>

        <div class="p-6 space-y-6">
            <!-- Autostart Toggle -->
            <button
                class="w-full flex items-center justify-between group"
                on:click={() => settings.toggleAppBehavior("autoStart")}
            >
                <div class="flex items-center gap-4">
                    <div
                        class="p-3 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors"
                    >
                        <Power size={20} />
                    </div>
                    <div class="text-left">
                        <div class="text-sm font-medium text-zinc-200">
                            Autostart with Windows
                        </div>
                        <div class="text-xs text-zinc-500">
                            Launch silently in background on login
                        </div>
                    </div>
                </div>
                <div
                    role="switch"
                    aria-checked={$settings.appBehavior.autoStart}
                    class="w-10 h-5 bg-zinc-700 rounded-full relative transition-colors {$settings
                        .appBehavior.autoStart
                        ? 'bg-indigo-500'
                        : ''}"
                >
                    <div
                        class="w-3 h-3 bg-white rounded-full absolute top-1 left-1 transition-transform {$settings
                            .appBehavior.autoStart
                            ? 'translate-x-5'
                            : ''}"
                    ></div>
                </div>
            </button>

            <!-- Tray Toggle -->
            <button
                class="w-full flex items-center justify-between group"
                on:click={() => settings.toggleAppBehavior("minimizeToTray")}
            >
                <div class="flex items-center gap-4">
                    <div
                        class="p-3 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors"
                    >
                        <ArrowDownToLine size={20} />
                    </div>
                    <div class="text-left">
                        <div class="text-sm font-medium text-zinc-200">
                            Minimize to Tray
                        </div>
                        <div class="text-xs text-zinc-500">
                            Keep running in background when closed
                        </div>
                    </div>
                </div>
                <div
                    role="switch"
                    aria-checked={$settings.appBehavior.minimizeToTray}
                    class="w-10 h-5 bg-zinc-700 rounded-full relative transition-colors {$settings
                        .appBehavior.minimizeToTray
                        ? 'bg-emerald-500'
                        : ''}"
                >
                    <div
                        class="w-3 h-3 bg-white rounded-full absolute top-1 left-1 transition-transform {$settings
                            .appBehavior.minimizeToTray
                            ? 'translate-x-5'
                            : ''}"
                    ></div>
                </div>
            </button>

            <!-- Start Minimized Toggle -->
            <button
                class="w-full flex items-center justify-between group"
                on:click={() => settings.toggleAppBehavior("startMinimized")}
            >
                <div class="flex items-center gap-4">
                    <div
                        class="p-3 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-sky-400 group-hover:bg-sky-500/10 transition-colors"
                    >
                        <EyeOff size={20} />
                    </div>
                    <div class="text-left">
                        <div class="text-sm font-medium text-zinc-200">
                            Start Minimized
                        </div>
                        <div class="text-xs text-zinc-500">
                            Launch hidden in tray
                        </div>
                    </div>
                </div>
                <div
                    role="switch"
                    aria-checked={$settings.appBehavior.startMinimized}
                    class="w-10 h-5 bg-zinc-700 rounded-full relative transition-colors {$settings
                        .appBehavior.startMinimized
                        ? 'bg-sky-500'
                        : ''}"
                >
                    <div
                        class="w-3 h-3 bg-white rounded-full absolute top-1 left-1 transition-transform {$settings
                            .appBehavior.startMinimized
                            ? 'translate-x-5'
                            : ''}"
                    ></div>
                </div>
            </button>

            <!-- Divider -->
            <div class="pt-4 border-t border-white/5">
                <div class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    LCD Cap Hardware Settings
                </div>
            </div>

            <!-- Brightness Setting -->
            <div class="space-y-3 pt-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="p-3 rounded-lg bg-zinc-800 text-zinc-400">
                            <Sun size={20} class="text-amber-400" />
                        </div>
                        <div class="text-left">
                            <div class="text-sm font-medium text-zinc-200">Screen Brightness</div>
                            <div class="text-xs text-zinc-500">Adjust screen backlight level</div>
                        </div>
                    </div>
                    <div class="text-xs font-bold text-zinc-300 font-mono bg-zinc-800/80 px-2 py-1 rounded border border-white/5">
                        {$settings.lcdConfig?.brightness ?? 100}%
                    </div>
                </div>
                <div class="px-2 pb-1 relative">
                    <input
                        type="range"
                        min="0"
                        max="3"
                        step="1"
                        value={brightnessIndex}
                        on:input={handleBrightnessChange}
                        class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:bg-zinc-700 transition-colors"
                    />
                    <div class="flex justify-between text-[10px] text-zinc-500 font-mono mt-2 px-0.5">
                        <span>0%</span>
                        <span>33%</span>
                        <span>66%</span>
                        <span>100%</span>
                    </div>
                </div>
            </div>

            <!-- Rotation Setting -->
            <div class="space-y-3 pt-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="p-3 rounded-lg bg-zinc-800 text-zinc-400">
                            <RotateCw size={20} class="text-indigo-400" />
                        </div>
                        <div class="text-left">
                            <div class="text-sm font-medium text-zinc-200">Display Rotation</div>
                            <div class="text-xs text-zinc-500">Rotate screen orientation</div>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-1 p-1 bg-zinc-900 rounded-lg border border-white/5">
                    {#each [0, 90, 180, 270] as angle}
                        <button
                            type="button"
                            class="py-1.5 text-xs font-mono font-medium rounded-md transition-all duration-200 {($settings.lcdConfig?.rotation ?? 0) === angle ? 'bg-indigo-500 text-white shadow-md font-bold' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}"
                            on:click={() => handleRotationChange(angle)}
                        >
                            {angle}°
                        </button>
                    {/each}
                </div>
            </div>
        </div>

        <div
            class="p-4 bg-black/20 text-center text-[10px] text-zinc-600 border-t border-white/5 font-mono"
        >
            HYDROSCREEN v{version}
        </div>
    </div>
</div>
