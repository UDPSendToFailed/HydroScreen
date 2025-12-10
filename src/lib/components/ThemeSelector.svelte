<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { settings } from '$lib/stores/settings';
    import { themeRegistry, refreshThemes } from '$lib/stores/themeStore';
    import { LayoutTemplate, CheckCircle2, Settings, Plus, Trash2 } from 'lucide-svelte';
    import { open } from '@tauri-apps/plugin-dialog';
    import { readTextFile, writeTextFile, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
    import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
    import ErrorModal from '$lib/components/ErrorModal.svelte';
    import { get } from 'svelte/store';

    const dispatch = createEventDispatcher();

    // Modal States
    let showDeleteModal = false;
    let themeToDelete: { fileName: string; id: string } | null = null;
    
    // Error State
    let showErrorModal = false;
    let errorMessage = "";

    onMount(() => {
        refreshThemes();
    });

    function select(id: string) {
        settings.setActiveTheme(id);
    }

    // Strict Validation
    function validateThemeObject(obj: any): string[] {
        const errors: string[] = [];
        
        if (!obj || typeof obj !== 'object') {
            return ["Script executed but did not return a valid object. Did you forget 'return {' ?"];
        }

        const requiredStrings = ['id', 'name', 'author', 'description'];
        requiredStrings.forEach(field => {
            if (!obj[field] || typeof obj[field] !== 'string') {
                errors.push(`Missing or invalid property: '${field}'`);
            }
        });

        if (typeof obj.renderFn !== 'function') {
            errors.push("Missing 'renderFn'. It must be a function.");
        }

        if (!Array.isArray(obj.slots)) {
            errors.push("'slots' must be an array.");
        }

        return errors;
    }

    async function importTheme() {
        try {
            const path = await open({
                multiple: false,
                filters: [{ name: 'Javascript Theme', extensions: ['js'] }]
            });

            if (path) {
                const code = await readTextFile(path);
                
                // 1. Syntax Check (Compilation)
                let themeObj;
                try {
                    const createTheme = new Function(code);
                    themeObj = createTheme();
                } catch (syntaxErr: any) {
                    // This catches "Unexpected identifier", "Missing comma", etc.
                    console.error("Syntax Error", syntaxErr);
                    errorMessage = `Javascript Syntax Error:\n${syntaxErr.message}\n\nCheck for missing commas or quotes in your file.`;
                    showErrorModal = true;
                    return;
                }

                // 2. Structure Check
                const validationErrors = validateThemeObject(themeObj);
                
                if (validationErrors.length > 0) {
                    errorMessage = "Invalid Theme Structure:\n• " + validationErrors.join("\n• ");
                    showErrorModal = true;
                    return;
                }

                // 3. ID Validation
                const id = themeObj.id;
                // Simple regex to ensure ID is safe for filenames
                if (!/^[a-z0-9-_]+$/i.test(id)) {
                    errorMessage = `Invalid ID: '${id}'.\nIDs must only contain letters, numbers, hyphens, and underscores.`;
                    showErrorModal = true;
                    return;
                }

                const filename = `${id}.js`;

                // 4. Save & Refresh
                await writeTextFile(`themes/${filename}`, code, { baseDir: BaseDirectory.AppData });
                await refreshThemes();
            }
        } catch (e: any) {
            console.error("Import failed", e);
            errorMessage = `System Error:\n${e.message || e}`;
            showErrorModal = true;
        }
    }

    function requestDelete(e: MouseEvent, fileName: string, id: string) {
        e.stopPropagation();
        themeToDelete = { fileName, id };
        showDeleteModal = true;
    }

    async function confirmDelete() {
        if (themeToDelete) {
            try {
                await remove(`themes/${themeToDelete.fileName}`, { baseDir: BaseDirectory.AppData });
                
                const currentSettings = get(settings);
                if (currentSettings.activeThemeId === themeToDelete.id) {
                    settings.setActiveTheme('liquid-flow');
                }

                await refreshThemes();
            } catch (e) {
                console.error("Delete failed", e);
            }
        }
        showDeleteModal = false;
        themeToDelete = null;
    }
</script>

<div class="flex flex-col h-full bg-zinc-900/80 border-r border-white/5 backdrop-blur-xl relative">
    
    {#if showDeleteModal}
        <ConfirmationModal 
            title="Remove Theme?"
            message="This custom theme will be permanently deleted from your library."
            confirmText="Delete"
            on:cancel={() => showDeleteModal = false}
            on:confirm={confirmDelete}
        />
    {/if}

    {#if showErrorModal}
        <ErrorModal 
            title="Import Failed"
            message={errorMessage}
            on:close={() => showErrorModal = false}
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
        <button on:click={importTheme} class="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors" title="Import .js Theme">
            <Plus size={18} />
        </button>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-2">
        {#each $themeRegistry as theme}
            <button 
                on:click={() => select(theme.id)}
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
                            <div 
                                role="button"
                                tabindex="0"
                                on:click={(e) => requestDelete(e, (theme as any)._fileName, theme.id)} 
                                on:keydown={() => {}}
                                class="p-1.5 hover:bg-red-500/20 text-zinc-600 hover:text-red-400 rounded transition-colors"
                            >
                                <Trash2 size={14} />
                            </div>
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