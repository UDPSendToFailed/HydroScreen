<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { fade, scale } from 'svelte/transition';
    import { settings } from '$lib/stores/settings';
    import { X, Power, ArrowDownToLine, Monitor, Import } from 'lucide-svelte';

    const dispatch = createEventDispatcher();

    function close() {
        dispatch('close');
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') close();
    }
</script>

<!-- Backdrop -->
<div 
    class="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-8 outline-none"
    transition:fade={{ duration: 200 }}
    on:click|self={close}
    on:keydown={handleKeydown}
    role="button"
    tabindex="0"
>
    <!-- Modal Content -->
    <div 
        class="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        transition:scale={{ duration: 200, start: 0.95 }}
        role="dialog"
        aria-modal="true"
    >
        <div class="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
                <Monitor size={18} class="text-indigo-500" />
                Application Settings
            </h2>
            <button on:click={close} class="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                <X size={18} />
            </button>
        </div>

        <div class="p-6 space-y-6">
            
            <!-- Autostart Toggle -->
            <button 
                class="w-full flex items-center justify-between group"
                on:click={() => settings.toggleAppBehavior('autoStart')}
            >
                <div class="flex items-center gap-4">
                    <div class="p-3 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                        <Power size={20} />
                    </div>
                    <div class="text-left">
                        <div class="text-sm font-medium text-zinc-200">Autostart with Windows</div>
                        <div class="text-xs text-zinc-500">Launch silently in background on login</div>
                    </div>
                </div>
                <div class="w-10 h-5 bg-zinc-700 rounded-full relative transition-colors {$settings.appBehavior.autoStart ? 'bg-indigo-500' : ''}">
                    <div class="w-3 h-3 bg-white rounded-full absolute top-1 left-1 transition-transform {$settings.appBehavior.autoStart ? 'translate-x-5' : ''}"></div>
                </div>
            </button>

            <!-- Tray Toggle -->
            <button 
                class="w-full flex items-center justify-between group"
                on:click={() => settings.toggleAppBehavior('minimizeToTray')}
            >
                <div class="flex items-center gap-4">
                    <div class="p-3 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                        <ArrowDownToLine size={20} />
                    </div>
                    <div class="text-left">
                        <div class="text-sm font-medium text-zinc-200">Minimize to Tray</div>
                        <div class="text-xs text-zinc-500">Keep running in background when closed</div>
                    </div>
                </div>
                <div class="w-10 h-5 bg-zinc-700 rounded-full relative transition-colors {$settings.appBehavior.minimizeToTray ? 'bg-emerald-500' : ''}">
                    <div class="w-3 h-3 bg-white rounded-full absolute top-1 left-1 transition-transform {$settings.appBehavior.minimizeToTray ? 'translate-x-5' : ''}"></div>
                </div>
            </button>

            <!-- Start Minimized Toggle -->
            <button 
                class="w-full flex items-center justify-between group"
                on:click={() => settings.toggleAppBehavior('startMinimized')}
            >
                <div class="flex items-center gap-4">
                    <div class="p-3 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-sky-400 group-hover:bg-sky-500/10 transition-colors">
                        <Import size={20} />
                    </div>
                    <div class="text-left">
                        <div class="text-sm font-medium text-zinc-200">Start Minimized</div>
                        <div class="text-xs text-zinc-500">Launch hidden in tray</div>
                    </div>
                </div>
                <div class="w-10 h-5 bg-zinc-700 rounded-full relative transition-colors {$settings.appBehavior.startMinimized ? 'bg-sky-500' : ''}">
                    <div class="w-3 h-3 bg-white rounded-full absolute top-1 left-1 transition-transform {$settings.appBehavior.startMinimized ? 'translate-x-5' : ''}"></div>
                </div>
            </button>

        </div>

        <div class="p-4 bg-black/20 text-center text-[10px] text-zinc-600 border-t border-white/5 font-mono">
            HYDROSCREEN v1.2.1
        </div>
    </div>
</div>