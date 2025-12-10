<script lang="ts">
    import { settings } from '$lib/stores/settings';
    import { rawHardware } from '$lib/stores/sensors';
    import { themeRegistry } from '$lib/stores/themeStore';
    import CanvasRenderer from '$lib/components/CanvasRenderer.svelte';
    import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
    import { Cpu, Zap, Activity, Thermometer, Palette, Check, Image as ImageIcon, MousePointer2, Type, RotateCcw, X } from 'lucide-svelte';
    import { open } from '@tauri-apps/plugin-dialog';
    import { BaseDirectory, writeFile, mkdir, exists, readFile, remove } from '@tauri-apps/plugin-fs';
    import type { Sensor, ThemeOption } from '$lib/types';

    let activeTab: 'data' | 'style' = 'data';
    let selectedSlotId: string | null = null;
    let expandedHwId: string | null = null;
    let searchQuery = '';
    let isDragging = false;
    let showResetModal = false;

    $: activeTheme = $themeRegistry.find(t => t.id === $settings.activeThemeId);
    $: mapping = $settings.mappings[$settings.activeThemeId] || {};
    $: config = $settings.themeConfigs[$settings.activeThemeId] || {};
    
    $: if (activeTheme && (!selectedSlotId || !activeTheme.slots.find(s => s.id === selectedSlotId))) {
        selectedSlotId = activeTheme.slots[0]?.id || null;
    }
    $: selectedSlot = activeTheme?.slots.find(s => s.id === selectedSlotId);
    $: supportsPanZoom = activeTheme?.options?.some(o => o.id === 'panX') && activeTheme?.options?.some(o => o.id === 'zoom');

    $: filteredHardware = (() => {
        const allowed = selectedSlot?.allowedTypes;
        const query = searchQuery.toLowerCase();

        return $rawHardware.map(hw => {
            if (!hw.Sensors) return { Id: hw.Id, Name: hw.Name, groups: {}, hasSensors: false };

            const relevantSensors = hw.Sensors.filter(s => {
                if (query && !s.Name.toLowerCase().includes(query) && !hw.Name.toLowerCase().includes(query)) return false;
                if (allowed && !allowed.includes(s.Type)) return false;
                return true;
            });

            const groups: Record<string, Sensor[]> = {};
            relevantSensors.forEach(s => {
                if (!groups[s.Type]) groups[s.Type] = [];
                groups[s.Type].push(s);
            });

            return { 
                Id: hw.Id, 
                Name: hw.Name, 
                groups, 
                hasSensors: relevantSensors.length > 0 
            };
        }).filter(h => h.hasSensors);
    })();

    function handleWheel(e: WheelEvent) {
        if (!supportsPanZoom || !activeTheme) return;
        e.preventDefault();
        const zoomOpt = activeTheme.options?.find(o => o.id === 'zoom');
        if(!zoomOpt) return;
        
        const min = zoomOpt.min || 10;
        const max = zoomOpt.max || 500;
        const currentZoom = config['zoom'] ?? 100;
        let newZoom = Math.min(Math.max(currentZoom + (-e.deltaY * 0.1), min), max);
        settings.updateThemeConfig(activeTheme.id, 'zoom', newZoom);
    }

    function handleMouseDown(e: MouseEvent) { if (supportsPanZoom && e.button === 0) isDragging = true; }
    function handleMouseUp() { isDragging = false; }
    
    function handleMouseMove(e: MouseEvent) {
        if (!isDragging || !activeTheme) return;
        settings.updateThemeConfig(activeTheme.id, 'panX', (config['panX'] ?? 0) + e.movementX);
        settings.updateThemeConfig(activeTheme.id, 'panY', (config['panY'] ?? 0) + e.movementY);
    }

    function mapSensor(hwId: string, sensor: Sensor) {
        if (!selectedSlotId || !activeTheme) return;
        
        settings.updateMapping(activeTheme.id, selectedSlotId, { 
            hwId, sensorId: sensor.Id, sensorType: sensor.Type 
        });

        const labelOptionId = `${selectedSlotId}Label`;
        const hasLabelOption = activeTheme.options?.some(o => o.id === labelOptionId && o.type === 'text');
        
        if (hasLabelOption) {
            const cleanName = sensor.Name.toUpperCase();
            settings.updateThemeConfig(activeTheme.id, labelOptionId, cleanName);
        }
    }

    function clearSlot(slotId: string) {
        if (!activeTheme) return;
        settings.updateMapping(activeTheme.id, slotId, null);
    }

    function updateConfig(optionId: string, value: any) {
        if (!activeTheme) return;
        settings.updateThemeConfig(activeTheme.id, optionId, value);
    }

    function isModified(opt: ThemeOption) {
        return config[opt.id] !== undefined && config[opt.id] !== opt.default;
    }

    async function resetOption(opt: ThemeOption) {
            if (!activeTheme) return;

            if (opt.type === 'file') {
                const oldPath = config[opt.id];
                if (oldPath && typeof oldPath === 'string') {
                    try {
                        await remove(oldPath, { baseDir: BaseDirectory.AppData });
                    } catch (e) {
                    }
                }
            }

            settings.updateThemeConfig(activeTheme.id, opt.id, opt.default);
        }

    async function confirmResetAll() {
            if (activeTheme && activeTheme.options) {
                for (const opt of activeTheme.options) {
                    if (opt.type === 'file') {
                        const pathToDelete = config[opt.id];
                        if (pathToDelete && typeof pathToDelete === 'string') {
                            try {
                                await remove(pathToDelete, { baseDir: BaseDirectory.AppData });
                            } catch (e) {
                                // Ignore errors
                            }
                        }
                    }
                }
                
                // After cleanup, reset the entire theme config
                settings.resetThemeConfig(activeTheme.id);
            }
            showResetModal = false;
        }

    async function selectFile(optionId: string) {
        try {
            const selectedPath = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
            });

            if (typeof selectedPath === 'string') {

                const oldPath = config[optionId];
                
                if (oldPath && typeof oldPath === 'string') {
                    try {
                        await remove(oldPath, { baseDir: BaseDirectory.AppData });
                        console.log(`Cleaned up old image: ${oldPath}`);
                    } catch (e) {
                    }
                }

                const hasDir = await exists('images', { baseDir: BaseDirectory.AppData });
                if (!hasDir) {
                    await mkdir('images', { baseDir: BaseDirectory.AppData, recursive: true });
                }

                const fileBytes = await readFile(selectedPath);
                const fileName = `${Date.now()}_${selectedPath.split(/[\\/]/).pop()}`;
                const newPath = `images/${fileName}`;

                await writeFile(newPath, fileBytes, { baseDir: BaseDirectory.AppData });
                updateConfig(optionId, newPath);
            }
        } catch (e) { 
            console.error("File selection/import failed:", e);
        }
    }

    function toggleHw(id: string) { expandedHwId = expandedHwId === id ? null : id; }
</script>

<svelte:window on:mouseup={handleMouseUp} />

{#if showResetModal}
    <ConfirmationModal 
        title="Reset Theme?"
        message="This will revert all colors and settings for this theme to their defaults. Data mappings will be kept."
        confirmText="Reset All"
        on:cancel={() => showResetModal = false}
        on:confirm={confirmResetAll}
    />
{/if}

<div class="flex h-full w-full overflow-hidden">
    <div class="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-zinc-900 to-black relative">
        <div class="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-white/5 backdrop-blur-sm z-10 shrink-0">
            <div class="min-w-0">
                <h1 class="text-xl font-bold text-white truncate">{activeTheme?.name || '...'}</h1>
                <p class="text-xs text-zinc-400">{activeTheme?.description || ''}</p>
            </div>
            
            <div class="flex items-center gap-4">
                {#if supportsPanZoom}
                    <div class="hidden md:flex items-center gap-2 text-[10px] text-zinc-500 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
                        <MousePointer2 size={12} />
                        <span>SCROLL / DRAG</span>
                    </div>
                {/if}

                <div class="flex bg-black/40 rounded-lg p-1 border border-white/5">
                    <button on:click={() => activeTab = 'data'} class="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors {activeTab === 'data' ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30' : 'text-zinc-400 hover:text-white border border-transparent'}">
                        <Activity size={14} /> Data
                    </button>
                    <button on:click={() => activeTab = 'style'} class="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors {activeTab === 'style' ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30' : 'text-zinc-400 hover:text-white border border-transparent'}">
                        <Palette size={14} /> Style
                    </button>
                </div>
            </div>
        </div>

        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div 
            class="flex-1 flex items-center justify-center p-4 md:p-8 min-h-0 relative overflow-hidden"
            role="application"
            on:wheel={handleWheel}
            on:mousedown={handleMouseDown}
            on:mousemove={handleMouseMove}
            style:cursor={supportsPanZoom ? (isDragging ? 'grabbing' : 'grab') : 'default'}
        >
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent opacity-50 pointer-events-none"></div>
            
            <div class="relative w-full max-w-[480px] aspect-square max-h-full pointer-events-none group"> 
                <div class="w-full h-full rounded-full ring-4 md:ring-8 ring-black shadow-2xl bg-black relative overflow-hidden">
                    <CanvasRenderer />
                </div>
                <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-white/5 to-transparent"></div>
            </div>
        </div>
    </div>

    <div class="w-[320px] md:w-[400px] border-l border-white/5 bg-zinc-900/80 backdrop-blur-xl flex flex-col shadow-2xl z-20 shrink-0">
        {#if activeTab === 'data'}
            <div class="flex-1 flex flex-col min-h-0 animate-in slide-in-from-right-4 duration-300">
                <div class="p-6 border-b border-white/5 shrink-0">
                    <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Display Slots</h3>
                    <div class="grid grid-cols-2 gap-2">
                        {#if activeTheme && activeTheme.slots}
                            {#each activeTheme.slots as slot}
                                <button 
                                    on:click={() => selectedSlotId = slot.id}
                                    class="text-left p-3 rounded-xl border transition-all relative overflow-hidden group
                                    {selectedSlotId === slot.id 
                                        ? 'bg-indigo-600/10 border-indigo-500/50 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]' 
                                        : 'bg-transparent border-white/5 text-zinc-400 hover:bg-white/5'}"
                                >
                                    <div class="flex justify-between items-center mb-1 relative z-10">
                                        <span class="block text-[10px] font-bold uppercase tracking-wider opacity-70 {selectedSlotId === slot.id ? 'text-white' : 'text-zinc-500'}">{slot.label}</span>
                                        {#if mapping[slot.id]}
                                            <div 
                                                role="button" 
                                                tabindex="0"
                                                on:click|stopPropagation={() => clearSlot(slot.id)}
                                                on:keydown={() => {}}
                                                class="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-white/10 transition-colors z-20"
                                                title="Clear Slot"
                                            >
                                                <X size={12} />
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="flex items-center gap-2 text-xs font-medium truncate h-5 relative z-10">
                                        {#if mapping[slot.id]}
                                            <Zap size={12} class="text-emerald-400 shrink-0" />
                                            <span class="truncate {selectedSlotId === slot.id ? 'text-zinc-200' : 'text-zinc-400'}">
                                                {$rawHardware.find(h => h.Id === mapping[slot.id]?.hwId)?.Sensors.find(s => s.Id === mapping[slot.id]?.sensorId)?.Name || 'Unknown'}
                                            </span>
                                        {:else}
                                            <span class="text-zinc-600 italic">Empty</span>
                                        {/if}
                                    </div>
                                </button>
                            {/each}
                        {:else}
                            <div class="col-span-2 text-center text-zinc-600 text-xs">No Data Slots</div>
                        {/if}
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-4 space-y-2">
                    <input type="text" bind:value={searchQuery} placeholder="Search sensors..." class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 mb-2"/>
                    {#each filteredHardware as hw}
                        <div class="bg-transparent border border-white/5 rounded-xl overflow-hidden">
                            <button on:click={() => toggleHw(hw.Id)} class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
                                <Cpu size={16} class="text-indigo-400"/>
                                <span class="text-sm font-bold text-zinc-300 flex-1 text-left truncate">{hw.Name}</span>
                                <span class="text-[10px] bg-white/5 border border-white/5 px-1.5 rounded text-zinc-500">{Object.values(hw.groups).flat().length}</span>
                            </button>
                            {#if expandedHwId === hw.Id || searchQuery}
                                <div class="bg-black/10 p-2 grid grid-cols-1 gap-2 border-t border-white/5">
                                    {#each Object.entries(hw.groups) as [type, sensors]}
                                        <div class="pl-2">
                                            <div class="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1 mt-2">{type}</div>
                                            <div class="space-y-1">
                                                {#each sensors as s}
                                                    <button on:click={() => mapSensor(hw.Id, s)} class="w-full flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all text-left {mapping[selectedSlotId!]?.sensorId === s.Id ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200' : 'bg-transparent border-transparent hover:bg-white/5 text-zinc-400 hover:text-zinc-200'}">
                                                        <span class="text-xs truncate">{s.Name}</span>
                                                        {#if mapping[selectedSlotId!]?.sensorId === s.Id} <Check size={12} class="text-emerald-500"/> {/if}
                                                    </button>
                                                {/each}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

        {:else if activeTab === 'style'}
            <div class="flex-1 overflow-y-auto p-6 animate-in slide-in-from-right-4 duration-300 flex flex-col">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-widest">Theme Settings</h3>
                    <button on:click={() => showResetModal = true} class="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded transition-colors border border-white/5">
                        <RotateCcw size={12} />
                        RESET ALL
                    </button>
                </div>

                <div class="space-y-6 flex-1">
                    {#if activeTheme?.options}
                        {#each activeTheme.options as opt}
                            <div class="space-y-2">
                                <div class="flex justify-between items-center h-5">
                                    <div class="flex items-center gap-2">
                                        <label for={opt.id} class="text-sm font-medium text-zinc-300">{opt.label}</label>
                                        {#if isModified(opt)}
                                            <button 
                                                on:click={() => resetOption(opt)} 
                                                class="text-zinc-500 hover:text-indigo-400 transition-colors animate-in fade-in zoom-in duration-200" 
                                                title="Reset to default"
                                            >
                                                <RotateCcw size={12} />
                                            </button>
                                        {/if}
                                    </div>
                                    {#if opt.type === 'range'}
                                        <span class="text-xs font-mono text-indigo-400">{config[opt.id] ?? opt.default}</span>
                                    {/if}
                                </div>

                                {#if opt.type === 'text'}
                                    <div class="relative">
                                        <input type="text" id={opt.id} value={config[opt.id] ?? opt.default} on:input={(e) => updateConfig(opt.id, e.currentTarget.value)} class="w-full h-10 bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"/>
                                        <Type size={16} class="absolute left-3 top-2.5 text-zinc-500" />
                                    </div>
                                {:else if opt.type === 'color'}
                                    <div class="flex gap-3">
                                        <div class="w-10 h-10 rounded-lg border border-white/10 shadow-inner shrink-0" style="background-color: {config[opt.id] ?? opt.default}"></div>
                                        <div class="relative flex-1">
                                            <input type="text" id={opt.id} value={config[opt.id] ?? opt.default} class="w-full h-10 bg-black/20 border border-white/10 rounded-lg px-3 text-sm font-mono text-zinc-400" readonly/>
                                            <input type="color" value={config[opt.id] ?? opt.default} on:input={(e) => updateConfig(opt.id, e.currentTarget.value)} class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"/>
                                        </div>
                                    </div>
                                {:else if opt.type === 'range'}
                                    <input type="range" id={opt.id} min={opt.min} max={opt.max} value={config[opt.id] ?? opt.default} on:input={(e) => updateConfig(opt.id, parseInt(e.currentTarget.value))} class="w-full accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"/>
                                {:else if opt.type === 'boolean'}
                                    <button id={opt.id} class="w-full flex items-center justify-between p-3 rounded-lg border transition-all {(config[opt.id] ?? opt.default) ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-100' : 'bg-black/20 border-white/10 text-zinc-500'}" on:click={() => updateConfig(opt.id, !(config[opt.id] ?? opt.default))}>
                                        <span class="text-sm">{(config[opt.id] ?? opt.default) ? 'Enabled' : 'Disabled'}</span>
                                        <div class="w-8 h-4 rounded-full relative transition-colors {(config[opt.id] ?? opt.default) ? 'bg-indigo-500' : 'bg-zinc-700'}"><div class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform {(config[opt.id] ?? opt.default) ? 'translate-x-4' : ''}"></div></div>
                                    </button>
                                {:else if opt.type === 'file'}
                                    <div class="flex gap-2">
                                        <div class="relative flex-1">
                                            <input type="text" id={opt.id} value={config[opt.id] ? config[opt.id].split(/[\\/]/).pop() : 'No file'} class="w-full h-10 bg-black/20 border border-white/10 rounded-lg px-3 text-sm font-mono text-zinc-500 truncate" readonly/>
                                        </div>
                                        <button on:click={() => selectFile(opt.id)} class="h-10 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-lg transition-colors flex items-center gap-2"><ImageIcon size={16} /><span class="text-xs font-bold">BROWSE</span></button>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>