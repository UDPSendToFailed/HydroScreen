<script lang="ts">
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { exit } from '@tauri-apps/plugin-process';
    import { settings } from '$lib/stores/settings';
    import { Minus, Square, X, RefreshCw } from 'lucide-svelte';
    import { get } from 'svelte/store';

    export let lhmStatus: 'active' | 'waiting';

    const appWindow = getCurrentWindow();

    async function handleClose() {
        const currentSettings = get(settings);
        const shouldMinimize = currentSettings?.appBehavior?.minimizeToTray ?? false;

        if (shouldMinimize) {
            await appWindow.hide();
        } else {
            await exit(0);
        }
    }
</script>

<div data-tauri-drag-region class="h-10 bg-zinc-900 border-b border-white/5 flex items-center justify-between pr-0 pl-4 select-none shrink-0 z-50">
    <div data-tauri-drag-region class="flex items-center gap-3 h-full w-[280px]">
        <div class="p-1 bg-indigo-500/10 rounded-md">
            <img src="/icon.png" class="w-3.5 h-3.5" alt="app icon" />
        </div>
        <span class="text-xs font-bold text-zinc-300 tracking-wide">HYDROSCREEN</span>
    </div>

    <div data-tauri-drag-region class="flex-1 flex items-center justify-end gap-6 px-6">
        <div class="flex items-center gap-2 text-[10px] font-medium opacity-70">
            <div class="flex items-center gap-1.5 {lhmStatus === 'active' ? 'text-emerald-400' : 'text-amber-500'}">
                {#if lhmStatus === 'active'}
                    <div class="w-1.5 h-1.5 rounded-full bg-current"></div>
                {:else}
                    <RefreshCw size={10} class="animate-spin" />
                {/if}
                <span>SENSORS</span>
            </div>
        </div>
    </div>

    <div class="flex items-center h-full ml-2 border-l border-white/5">
        <button on:click={() => appWindow.minimize()} class="h-full px-4 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"><Minus size={14} /></button>
        <button on:click={() => appWindow.toggleMaximize()} class="h-full px-4 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"><Square size={12} /></button>
        <button on:click={handleClose} class="h-full px-4 hover:bg-red-500 hover:text-white text-zinc-400 transition-colors"><X size={14} /></button>
    </div>
</div>