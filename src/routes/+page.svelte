<script lang="ts">
    import { onMount } from 'svelte';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { settings, settingsReady } from '$lib/stores/settings';
    import { initSensorListener, isConnected } from '$lib/stores/sensors';
    import TitleBar from '$lib/components/TitleBar.svelte';
    import ThemeSelector from '$lib/components/ThemeSelector.svelte';
    import ThemeConfigurator from '$lib/components/ThemeConfigurator.svelte';
    import SettingsModal from '$lib/components/SettingsModal.svelte';
    import { Loader2 } from 'lucide-svelte';

    let showSettings = false;

    onMount(async () => {
        const win = getCurrentWindow();
        
        await settings.init();
        
        if (!$settings.appBehavior.startMinimized) {
            await win.show();
            await win.setFocus();
        }

        initSensorListener();

        win.listen('tauri://close-requested', async (event) => {
            if ($settings.appBehavior.minimizeToTray) {
                // Tray logic handled by TitleBar usually
            }
        });
    });
</script>

<div class="h-screen w-screen bg-[#09090b] text-zinc-200 flex flex-col overflow-hidden font-sans selection:bg-indigo-500/30">
    {#if $settingsReady}
        <TitleBar lhmStatus={$isConnected ? 'active' : 'waiting'} deviceStatus={'connected'} />

        <div class="flex-1 flex overflow-hidden relative">
            <aside class="w-[280px] shrink-0 z-30 shadow-2xl">
                <ThemeSelector on:openSettings={() => showSettings = true} />
            </aside>

            <main class="flex-1 min-w-0 bg-black relative z-0">
                <ThemeConfigurator />
            </main>
            
            {#if showSettings}
                <SettingsModal on:close={() => showSettings = false} />
            {/if}
        </div>
    {:else}
        <div class="flex-1 flex flex-col items-center justify-center">
            <Loader2 size={32} class="text-indigo-500 animate-spin mb-2" />
            <span class="text-xs text-zinc-500 uppercase tracking-widest">Loading Settings...</span>
        </div>
    {/if}
</div>