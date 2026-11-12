<script lang="ts">
    import { settings } from "#lib/stores/settings.ts";
    import { rawHardware } from "#lib/stores/sensors.ts";
    import {
        Type,
        RotateCcw,
        X,
        ImageIcon,
        ChevronDown,
        Search,
    } from "@lucide/svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { onMount, createEventDispatcher } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import {
        BaseDirectory,
        writeFile,
        mkdir,
        exists,
        readFile,
        remove,
    } from "@tauri-apps/plugin-fs";
    import { slide } from "svelte/transition";
    import type { ThemeDefinition, ThemeOption } from "#lib/types.ts";
    import { getDefaultRange } from "#lib/utils.ts";

    export let activeTheme: ThemeDefinition | undefined;

    const dispatch = createEventDispatcher();

    // Font Picker State
    let openFontDropdownId: string | null = null;
    let fontSearchQuery = "";

    let AVAILABLE_FONTS: string[] = [
        "Arial",
        "Consolas",
        "Inter",
        "Segoe UI",
        "Times New Roman",
        "Verdana",
    ];

    onMount(async () => {
        try {
            const sysFonts = await invoke<string[]>("get_system_fonts");
            if (sysFonts && sysFonts.length > 0) {
                AVAILABLE_FONTS = sysFonts;
            }
        } catch (e) {
            console.error("Failed to load system fonts", e);
        }
    });

    $: mapping = $settings.mappings[$settings.activeThemeId] || {};
    $: config = $settings.themeConfigs[$settings.activeThemeId] || {};

    // Filtered Fonts
    $: filteredFonts = AVAILABLE_FONTS.filter((f) =>
        f.toLowerCase().includes(fontSearchQuery.toLowerCase()),
    );

    function updateConfig(optionId: string, value: any) {
        if (!activeTheme) return;
        settings.updateThemeConfig(activeTheme.id, optionId, value);
    }

    function isModified(opt: ThemeOption) {
        return config[opt.id] !== undefined && config[opt.id] !== opt.default;
    }

    $: isFontScaleModified =
        config["globalFontScale"] !== undefined &&
        config["globalFontScale"] !== 100;

    function isSlotRangeModified(slotId: string) {
        const mapped = mapping[slotId];
        if (!mapped) return false;

        const defaults = getDefaultRange(mapped.sensorType);
        return (
            (config[`${slotId}Min`] !== undefined &&
                config[`${slotId}Min`] !== defaults.min) ||
            (config[`${slotId}Max`] !== undefined &&
                config[`${slotId}Max`] !== defaults.max)
        );
    }

    async function resetOption(opt: ThemeOption) {
        if (!activeTheme) return;

        if (opt.type === "file") {
            const oldPath = config[opt.id];
            if (oldPath && typeof oldPath === "string") {
                try {
                    await remove(oldPath, { baseDir: BaseDirectory.AppData });
                } catch (e) {}
            }
        }

        settings.updateThemeConfig(activeTheme.id, opt.id, opt.default);
    }

    function resetFontScale() {
        if (!activeTheme) return;
        settings.updateThemeConfig(activeTheme.id, "globalFontScale", 100);
    }

    function resetSlotRange(slotId: string) {
        if (!activeTheme) return;
        const mapped = mapping[slotId];
        if (!mapped) return;
        const defaults = getDefaultRange(mapped.sensorType);
        settings.updateThemeConfig(
            activeTheme.id,
            `${slotId}Min`,
            defaults.min,
        );
        settings.updateThemeConfig(
            activeTheme.id,
            `${slotId}Max`,
            defaults.max,
        );
    }

    async function selectFile(optionId: string) {
        try {
            const selectedPath = await open({
                multiple: false,
                directory: false,
                filters: [
                    {
                        name: "Images",
                        extensions: ["png", "jpg", "jpeg", "gif"],
                    },
                ],
            });

            if (typeof selectedPath === "string") {
                const oldPath = config[optionId];
                if (oldPath && typeof oldPath === "string") {
                    try {
                        await remove(oldPath, {
                            baseDir: BaseDirectory.AppData,
                        });
                    } catch (e) {}
                }

                const hasDir = await exists("images", {
                    baseDir: BaseDirectory.AppData,
                });
                if (!hasDir) {
                    await mkdir("images", {
                        baseDir: BaseDirectory.AppData,
                        recursive: true,
                    });
                }

                const fileBytes = await readFile(selectedPath);
                const fileName = `${Date.now()}_${selectedPath.split(/[\\/]/).pop()}`;
                const newPath = `images/${fileName}`;

                await writeFile(newPath, fileBytes, {
                    baseDir: BaseDirectory.AppData,
                });
                updateConfig(optionId, newPath);
            }
        } catch (e) {
            console.error("File selection/import failed:", e);
        }
    }

    function toggleFontDropdown(id: string) {
        if (openFontDropdownId === id) {
            openFontDropdownId = null;
        } else {
            openFontDropdownId = id;
            fontSearchQuery = "";
        }
    }

    function selectFont(id: string, font: string) {
        updateConfig(id, font);
        openFontDropdownId = null;
    }

    function handleClickOutside(event: MouseEvent) {
        if (
            openFontDropdownId &&
            !(event.target as Element).closest(".font-dropdown-container")
        ) {
            openFontDropdownId = null;
        }
    }
</script>

<svelte:window on:click={handleClickOutside} />

<div
    class="flex-1 overflow-y-auto p-6 animate-in slide-in-from-right-4 duration-300 flex flex-col"
>
    <div class="flex justify-between items-center mb-6">
        <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-widest">
            Theme Settings
        </h3>
        <button
            on:click={() => dispatch("requestReset")}
            class="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded transition-colors border border-white/5"
        >
            <RotateCcw size={12} />
            RESET ALL
        </button>
    </div>

    <div class="space-y-8 flex-1">
        {#if activeTheme?.options}
            <!-- Global Style Options -->
            <div>
                <h4
                    class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3"
                >
                    Global Settings
                </h4>
                <div
                    class="bg-black/20 rounded-xl p-4 border border-white/5 space-y-3"
                >
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <Type size={14} class="text-indigo-400" />
                            <label
                                for="globalFontScale"
                                class="text-xs font-bold text-zinc-300 uppercase tracking-wider"
                                >Global Scaling</label
                            >
                        </div>
                        {#if isFontScaleModified}
                            <button
                                on:click={resetFontScale}
                                class="text-[10px] text-zinc-500 hover:text-indigo-400 flex items-center gap-1 transition-colors"
                                title="Reset to 100%"
                            >
                                <RotateCcw size={10} />
                                <span>RESET</span>
                            </button>
                        {/if}
                    </div>

                    <div class="flex items-center gap-3">
                        <input
                            id="globalFontScale"
                            type="range"
                            min="50"
                            max="200"
                            step="5"
                            value={config["globalFontScale"] ?? 100}
                            on:input={(e) =>
                                updateConfig(
                                    "globalFontScale",
                                    parseInt(e.currentTarget.value),
                                )}
                            class="flex-1 accent-indigo-500 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                        />
                        <div class="relative w-16 shrink-0">
                            <input
                                type="number"
                                min="50"
                                max="200"
                                value={config["globalFontScale"] ?? 100}
                                on:input={(e) =>
                                    updateConfig(
                                        "globalFontScale",
                                        parseInt(e.currentTarget.value),
                                    )}
                                class="w-full input-standard px-2 py-1 text-right font-mono text-indigo-300"
                            />
                            <span
                                class="absolute right-6 top-1 text-[10px] text-zinc-600 pointer-events-none"
                                >%</span
                            >
                        </div>
                    </div>
                </div>
            </div>

            <!-- Range Configuration (Moved from Data Tab) -->
            {#if activeTheme.slots.some((s) => mapping[s.id])}
                <div>
                    <h4
                        class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3"
                    >
                        Data Ranges
                    </h4>
                    <div class="space-y-3">
                        {#each activeTheme.slots as slot}
                            {#if mapping[slot.id]}
                                <div
                                    class="bg-black/20 rounded-xl p-3 border border-white/5 space-y-3"
                                >
                                    <div
                                        class="flex justify-between items-start"
                                    >
                                        <div>
                                            <label
                                                for="{slot.id}Min"
                                                class="block text-xs font-bold text-zinc-300 mb-0.5"
                                                >{slot.label}</label
                                            >
                                            <span
                                                class="block text-[10px] text-zinc-500 truncate max-w-[150px]"
                                            >
                                                {$rawHardware
                                                    .find(
                                                        (h) =>
                                                            h.Id ===
                                                            mapping[slot.id]
                                                                ?.hwId,
                                                    )
                                                    ?.Sensors.find(
                                                        (s) =>
                                                            s.Id ===
                                                            mapping[slot.id]
                                                                ?.sensorId,
                                                    )?.Name ?? "..."}
                                            </span>
                                        </div>
                                        {#if isSlotRangeModified(slot.id)}
                                            <button
                                                on:click={() =>
                                                    resetSlotRange(slot.id)}
                                                class="text-zinc-500 hover:text-indigo-400 transition-colors p-1"
                                                title="Reset range"
                                            >
                                                <RotateCcw size={12} />
                                            </button>
                                        {/if}
                                    </div>

                                    <div class="grid grid-cols-2 gap-3">
                                        <div class="relative group">
                                            <span
                                                class="absolute left-2.5 top-2 text-[10px] font-bold text-zinc-600 group-focus-within:text-indigo-500/50 transition-colors"
                                                >MIN</span
                                            >
                                            <input
                                                id="{slot.id}Min"
                                                type="number"
                                                value={config[
                                                    `${slot.id}Min`
                                                ] ?? 0}
                                                on:change={(e) =>
                                                    updateConfig(
                                                        `${slot.id}Min`,
                                                        parseFloat(
                                                            e.currentTarget
                                                                .value,
                                                        ),
                                                    )}
                                                class="w-full input-standard pl-2 pr-2 pt-5 pb-1.5 font-mono"
                                            />
                                        </div>
                                        <div class="relative group">
                                            <span
                                                class="absolute left-2.5 top-2 text-[10px] font-bold text-zinc-600 group-focus-within:text-emerald-500/50 transition-colors"
                                                >MAX</span
                                            >
                                            <input
                                                id="{slot.id}Max"
                                                type="number"
                                                value={config[
                                                    `${slot.id}Max`
                                                ] ?? 100}
                                                on:change={(e) =>
                                                    updateConfig(
                                                        `${slot.id}Max`,
                                                        parseFloat(
                                                            e.currentTarget
                                                                .value,
                                                        ),
                                                    )}
                                                class="w-full input-standard pl-2 pr-2 pt-5 pb-1.5 font-mono focus:border-emerald-500/50 focus:bg-emerald-500/5"
                                            />
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- Theme Specific Options -->
            <div>
                <h4
                    class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3"
                >
                    Customization
                </h4>
                <div class="space-y-3">
                    {#each activeTheme.options as opt}
                        <div
                            class="bg-black/20 rounded-xl p-3 border border-white/5 space-y-2"
                        >
                            <div class="flex justify-between items-center h-5">
                                <div class="flex items-center gap-2">
                                    <label
                                        for={opt.id}
                                        class="text-xs font-bold text-zinc-300 uppercase tracking-wider"
                                        >{opt.label}</label
                                    >
                                    {#if isModified(opt)}
                                        <button
                                            on:click={() => resetOption(opt)}
                                            class="text-zinc-500 hover:text-indigo-400 transition-colors p-0.5 animate-in fade-in zoom-in duration-200"
                                            title="Reset to default"
                                        >
                                            <RotateCcw size={10} />
                                        </button>
                                    {/if}
                                </div>
                                {#if opt.type === "range"}
                                    <span
                                        class="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 rounded"
                                        >{config[opt.id] ?? opt.default}</span
                                    >
                                {/if}
                            </div>

                            {#if opt.type === "text"}
                                <div class="relative group">
                                    <input
                                        type="text"
                                        id={opt.id}
                                        value={config[opt.id] ?? opt.default}
                                        on:input={(e) =>
                                            updateConfig(
                                                opt.id,
                                                e.currentTarget.value,
                                            )}
                                        class="w-full h-9 input-standard pl-8 pr-3"
                                    />
                                    <Type
                                        size={14}
                                        class="absolute left-2.5 top-2.5 text-zinc-500 group-focus-within:text-indigo-400 transition-colors"
                                    />
                                </div>
                            {:else if opt.type === "color"}
                                <div class="flex gap-2">
                                    <div
                                        class="w-9 h-9 rounded-lg border border-white/10 shadow-inner shrink-0 relative overflow-hidden"
                                    >
                                        <div
                                            class="absolute inset-0"
                                            style="background-color: {config[
                                                opt.id
                                            ] ?? opt.default}"
                                        ></div>
                                        <input
                                            type="color"
                                            value={config[opt.id] ??
                                                opt.default}
                                            on:input={(e) =>
                                                updateConfig(
                                                    opt.id,
                                                    e.currentTarget.value,
                                                )}
                                            class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        />
                                    </div>
                                    <div class="relative flex-1">
                                        <input
                                            type="text"
                                            id={opt.id}
                                            value={config[opt.id] ??
                                                opt.default}
                                            on:input={(e) => {
                                                const val = e.currentTarget.value.trim();
                                                // Accept valid hex colors
                                                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                                                    updateConfig(opt.id, val);
                                                }
                                            }}
                                            on:blur={(e) => {
                                                let val = e.currentTarget.value.trim();
                                                // Auto-prepend # if missing
                                                if (/^[0-9a-fA-F]{6}$/.test(val)) val = '#' + val;
                                                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                                                    updateConfig(opt.id, val);
                                                } else {
                                                    // Revert to current value on invalid input
                                                    e.currentTarget.value = config[opt.id] ?? opt.default;
                                                }
                                            }}
                                            class="w-full h-9 input-standard px-3 font-mono text-zinc-300 focus:border-white/20 uppercase"
                                            maxlength="7"
                                            placeholder="#000000"
                                        />
                                    </div>
                                </div>
                            {:else if opt.type === "range"}
                                <div class="flex items-center gap-3 pt-1">
                                    <input
                                        type="range"
                                        id={opt.id}
                                        min={opt.min}
                                        max={opt.max}
                                        value={config[opt.id] ?? opt.default}
                                        on:input={(e) =>
                                            updateConfig(
                                                opt.id,
                                                parseInt(e.currentTarget.value),
                                            )}
                                        class="flex-1 accent-indigo-500 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                                    />
                                </div>
                            {:else if opt.type === "boolean"}
                                <button
                                    id={opt.id}
                                    class="w-full flex items-center justify-between p-2 rounded-lg border transition-all {(config[
                                        opt.id
                                    ] ?? opt.default)
                                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-100'
                                        : 'bg-black/40 border-white/10 text-zinc-500 hover:bg-white/5'}"
                                    on:click={() =>
                                        updateConfig(
                                            opt.id,
                                            !(config[opt.id] ?? opt.default),
                                        )}
                                >
                                    <span class="text-xs font-medium"
                                        >{(config[opt.id] ?? opt.default)
                                            ? "Enabled"
                                            : "Disabled"}</span
                                    >
                                    <div
                                        class="w-7 h-4 rounded-full relative transition-colors {(config[
                                            opt.id
                                        ] ?? opt.default)
                                            ? 'bg-indigo-500'
                                            : 'bg-zinc-700'}"
                                    >
                                        <div
                                            class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform {(config[
                                                opt.id
                                            ] ?? opt.default)
                                                ? 'translate-x-3'
                                                : ''} shadow-sm"
                                        ></div>
                                    </div>
                                </button>
                            {:else if opt.type === "file"}
                                <div class="flex gap-2">
                                    <div class="relative flex-1 group">
                                        <input
                                            type="text"
                                            id={opt.id}
                                            value={config[opt.id]
                                                ? config[opt.id]
                                                      .split(/[\\/]/)
                                                      .pop()
                                                : "No file selected"}
                                            class="w-full h-9 input-standard px-3 font-mono text-zinc-500 truncate pointer-events-none"
                                            readonly
                                        />
                                    </div>
                                    {#if config[opt.id]}
                                        <button
                                            on:click={() =>
                                                updateConfig(opt.id, null)}
                                            class="h-9 w-9 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                                            title="Clear File"
                                        >
                                            <X size={14} />
                                        </button>
                                    {/if}
                                    <button
                                        on:click={() => selectFile(opt.id)}
                                        class="h-9 px-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold"
                                    >
                                        <ImageIcon size={14} />
                                        <span>BROWSE</span>
                                    </button>
                                </div>
                            {:else if opt.type === "font"}
                                <div class="relative font-dropdown-container">
                                    <button
                                        class="w-full h-9 input-standard px-3 flex items-center justify-between hover:bg-white/5 group"
                                        on:click={() =>
                                            toggleFontDropdown(opt.id)}
                                    >
                                        <span
                                            class="text-xs text-zinc-300 group-hover:text-white transition-colors"
                                            style="font-family: {config[
                                                opt.id
                                            ] ?? opt.default}"
                                            >{config[opt.id] ??
                                                opt.default}</span
                                        >
                                        <ChevronDown
                                            size={14}
                                            class="text-zinc-500 group-hover:text-zinc-300"
                                        />
                                    </button>

                                    {#if openFontDropdownId === opt.id}
                                        <div
                                            class="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden max-h-48 flex flex-col"
                                            transition:slide={{
                                                duration: 150,
                                            }}
                                        >
                                            <div
                                                class="p-1.5 border-b border-white/5 sticky top-0 bg-zinc-900 z-10"
                                            >
                                                <div class="relative">
                                                    <Search
                                                        size={12}
                                                        class="absolute left-2.5 top-2 text-zinc-500"
                                                    />
                                                    <input
                                                        type="text"
                                                        bind:value={
                                                            fontSearchQuery
                                                        }
                                                        placeholder="Search..."
                                                        class="w-full bg-black/40 border border-white/5 rounded pl-7 pr-2 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500/50"
                                                        on:click|stopPropagation
                                                    />
                                                </div>
                                            </div>
                                            <div
                                                class="overflow-y-auto flex-1 p-1"
                                            >
                                                {#each filteredFonts as font}
                                                    <button
                                                        class="w-full text-left px-2 py-1.5 text-xs hover:bg-white/10 rounded transition-colors {config[
                                                            opt.id
                                                        ] === font
                                                            ? 'text-indigo-400 bg-indigo-500/10 font-bold'
                                                            : 'text-zinc-400'}"
                                                        style="font-family: {font}"
                                                        on:click={() =>
                                                            selectFont(
                                                                opt.id,
                                                                font,
                                                            )}
                                                    >
                                                        {font}
                                                    </button>
                                                {/each}
                                                {#if filteredFonts.length === 0}
                                                    <div
                                                        class="px-2 py-2 text-[10px] text-zinc-600 text-center italic"
                                                    >
                                                        No fonts found
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>
