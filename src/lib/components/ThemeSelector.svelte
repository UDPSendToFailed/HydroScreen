<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { settings } from '$lib/stores/settings';
    import { themeRegistry } from '$lib/stores/themeStore';
    import { LayoutTemplate, CheckCircle2, Settings, Plus, Trash2, Loader2 } from 'lucide-svelte';
    import { open } from '@tauri-apps/plugin-dialog';
    import { readTextFile } from '@tauri-apps/plugin-fs';
    import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';

    const dispatch = createEventDispatcher();

    // Modal State
    let showDeleteModal = false;
    let themeToDelete: { index: number; id: string } | null = null;
    let importing = false;

    function select(id: string) {
        settings.setActiveTheme(id);
    }

    async function importTheme() {
        importing = true;
        try {
            const path = await open({
                multiple: false,
                filters: [{ name: 'Javascript Theme', extensions: ['js'] }]
            });

            if (path) {
                const code = await readTextFile(path);
                settings.addCustomTheme(code);
            }
        } catch (e) {
            console.error("Import failed", e);
            // Could add user notification here
        } finally {
            importing = false;
        }
    }

    function requestDelete(e: MouseEvent, index: number, id: string) {
        e.stopPropagation();
        themeToDelete = { index, id };
        showDeleteModal = true;
    }

    function confirmDelete() {
        if (themeToDelete) {
            settings.removeCustomTheme(themeToDelete.index, themeToDelete.id);
        }
        showDeleteModal = false;
        themeToDelete = null;
    }
</script>

<div class="flex flex-col h-full bg-zinc-900/80 border-r border-white/5 backdrop-blur-xl relative">
    
    <!-- Delete Confirmation Overlay -->
    {#if showDeleteModal}
        <ConfirmationModal 
            title="Remove Theme?"
            message="This custom theme will be permanently removed from your library."
            confirmText="Remove"
            on:cancel={() => showDeleteModal = false}
            on:confirm={confirmDelete}
        />
    {/if}

    <div class="p-6 border-b border-white/5 shrink-0 flex justify-between items-center">
        <div>
            <div class="flex items-center gap-3 text-white mb-1">
                <LayoutTemplate class="text-indigo-500" size={20} />
                <h2 class="font-bold tracking-tight">Library</h2>
            </div>
            <p class="text-xs text-zinc-500">Select layout.</p>
        </div>
        <button on:click={importTheme} disabled={importing} class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Import .js Theme">
            {#if importing}
                <Loader2 size={18} class="animate-spin" />
            {:else}
                <Plus size={18} />
            {/if}
        </button>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-2" role="list">
        {#each $themeRegistry as theme}
            <button
                on:click={() => select(theme.id)}
                aria-label="Select theme {theme.name} by {theme.author}"
                class="w-full text-left p-3 rounded-xl border transition-all duration-200 group relative overflow-hidden
                {$settings.activeThemeId === theme.id
                    ? 'bg-indigo-600/10 border-indigo-500/50 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]'
                    : 'bg-transparent border-transparent hover:bg-white/5'}"
            >
                <div class="flex justify-between items-start relative z-10">
                    <div>
                        <span class="block font-bold text-sm {$settings.activeThemeId === theme.id ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}">
                            {theme.name}
                        </span>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-[10px] text-zinc-500">{theme.author}</span>
                            {#if (theme as any)._isCustom}
                                <span class="text-[8px] bg-amber-500/10 text-amber-500 px-1 rounded border border-amber-500/20">CUSTOM</span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                        {#if $settings.activeThemeId === theme.id}
                            <CheckCircle2 size={16} class="text-indigo-400 animate-in zoom-in duration-300" />
                        {/if}
                        
                        {#if (theme as any)._isCustom}
                            <span
                                role="button"
                                tabindex="0"
                                aria-label="Delete custom theme {theme.name}"
                                on:click={(e) => requestDelete(e, (theme as any)._customIndex, theme.id)}
                                on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestDelete(e, (theme as any)._customIndex, theme.id); } }}
                                class="p-1.5 hover:bg-red-500/20 text-zinc-600 hover:text-red-400 rounded transition-colors cursor-pointer"
                            >
                                <Trash2 size={14} />
                            </span>
                        {/if}
                    </div>
                </div>
            </button>
        {/each}
    </div>

    <div class="p-4 border-t border-white/5 bg-black/20 shrink-0 flex items-center justify-between">
        <div class="flex flex-col">
            <span class="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Installed</span>
            <span class="text-xs text-zinc-300 font-mono">{$themeRegistry.length} Themes</span>
        </div>

        <button 
            on:click={() => dispatch('openSettings')}
            class="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
        >
            <Settings size={16} />
        </button>
    </div>
</div>