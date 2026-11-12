<script lang="ts">
    import { settings } from "#lib/stores/settings.ts";
    import { rawHardware } from "#lib/stores/sensors.ts";
    import { Cpu, Zap, Check, X } from "@lucide/svelte";
    import { slide } from "svelte/transition";
    import type { Sensor, ThemeDefinition } from "#lib/types.ts";
    import { getDefaultRange } from "#lib/utils.ts";

    export let activeTheme: ThemeDefinition | undefined;

    let selectedSlotId: string | null = null;
    let expandedHwId: string | null = null;
    let searchQuery = "";

    $: mapping = $settings.mappings[$settings.activeThemeId] || {};
    $: config = $settings.themeConfigs[$settings.activeThemeId] || {};

    $: if (
        activeTheme &&
        (!selectedSlotId ||
            !activeTheme.slots.find((s) => s.id === selectedSlotId))
    ) {
        selectedSlotId = activeTheme.slots[0]?.id || null;
    }
    $: selectedSlot = activeTheme?.slots.find((s) => s.id === selectedSlotId);

    $: filteredHardware = (() => {
        const allowed = selectedSlot?.allowedTypes;
        const query = searchQuery.toLowerCase();

        return $rawHardware
            .map((hw) => {
                if (!hw.Sensors)
                    return {
                        Id: hw.Id,
                        Name: hw.Name,
                        groups: {},
                        hasSensors: false,
                    };

                const relevantSensors = hw.Sensors.filter((s) => {
                    if (
                        query &&
                        !s.Name.toLowerCase().includes(query) &&
                        !hw.Name.toLowerCase().includes(query)
                    )
                        return false;
                    if (allowed && !allowed.includes(s.Type)) return false;
                    return true;
                });

                const groups: Record<string, Sensor[]> = {};
                relevantSensors.forEach((s) => {
                    if (!groups[s.Type]) groups[s.Type] = [];
                    groups[s.Type].push(s);
                });

                return {
                    Id: hw.Id,
                    Name: hw.Name,
                    groups,
                    hasSensors: relevantSensors.length > 0,
                };
            })
            .filter((h) => h.hasSensors);
    })();

    function mapSensor(hwId: string, sensor: Sensor) {
        if (!selectedSlotId || !activeTheme) return;

        settings.updateMapping(activeTheme.id, selectedSlotId, {
            hwId,
            sensorId: sensor.Id,
            sensorType: sensor.Type,
        });

        const labelOptionId = `${selectedSlotId}Label`;
        const hasLabelOption = activeTheme.options?.some(
            (o) => o.id === labelOptionId && o.type === "text",
        );

        if (hasLabelOption) {
            const cleanName = sensor.Name.toUpperCase();
            settings.updateThemeConfig(
                activeTheme.id,
                labelOptionId,
                cleanName,
            );
        }

        // AUTO-CONFIGURE DEFAULTS
        const { min, max } = getDefaultRange(sensor.Type);

        // Only set if not already set or if it looks 'default'
        if (config[`${selectedSlotId}Min`] === undefined)
            settings.updateThemeConfig(
                activeTheme.id,
                `${selectedSlotId}Min`,
                min,
            );
        // Reset max if it seems stale (simple logic: just set it)
        settings.updateThemeConfig(activeTheme.id, `${selectedSlotId}Max`, max);
    }

    function clearSlot(slotId: string) {
        if (!activeTheme) return;
        settings.updateMapping(activeTheme.id, slotId, null);
    }

    function toggleHw(id: string) {
        expandedHwId = expandedHwId === id ? null : id;
    }
</script>

<div
    class="flex-1 flex flex-col min-h-0 animate-in slide-in-from-right-4 duration-300"
>
    <div class="p-6 border-b border-white/5 shrink-0">
        <h3
            class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3"
        >
            Display Slots
        </h3>
        <div class="grid grid-cols-2 gap-2">
            {#if activeTheme && activeTheme.slots}
                {#each activeTheme.slots as slot}
                    <button
                        on:click={() => (selectedSlotId = slot.id)}
                        class="text-left p-3 rounded-xl border transition-all relative overflow-hidden group
                        {selectedSlotId === slot.id
                            ? 'bg-indigo-600/10 border-indigo-500/50 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]'
                            : 'bg-transparent border-white/5 text-zinc-400 hover:bg-white/5'}"
                    >
                        <div
                            class="flex justify-between items-center mb-1 relative z-10"
                        >
                            <span
                                class="block text-[10px] font-bold uppercase tracking-wider opacity-70 {selectedSlotId ===
                                slot.id
                                    ? 'text-white'
                                    : 'text-zinc-500'}">{slot.label}</span
                            >
                            {#if mapping[slot.id]}
                                <div
                                    role="button"
                                    tabindex="0"
                                    on:click|stopPropagation={() =>
                                        clearSlot(slot.id)}
                                    on:keydown={() => {}}
                                    class="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-white/10 transition-colors z-20"
                                    title="Clear Slot"
                                >
                                    <X size={12} />
                                </div>
                            {/if}
                        </div>
                        <div
                            class="flex items-center gap-2 text-xs font-medium truncate h-5 relative z-10"
                        >
                            {#if mapping[slot.id]}
                                <Zap
                                    size={12}
                                    class="text-emerald-400 shrink-0"
                                />
                                <span
                                    class="truncate {selectedSlotId === slot.id
                                        ? 'text-zinc-200'
                                        : 'text-zinc-400'}"
                                >
                                    {$rawHardware
                                        .find(
                                            (h) =>
                                                h.Id === mapping[slot.id]?.hwId,
                                        )
                                        ?.Sensors.find(
                                            (s) =>
                                                s.Id ===
                                                mapping[slot.id]?.sensorId,
                                        )?.Name || "Unknown"}
                                </span>
                            {:else}
                                <span class="text-zinc-600 italic">Empty</span>
                            {/if}
                        </div>
                    </button>
                {/each}
            {:else}
                <div class="col-span-2 text-center text-zinc-600 text-xs">
                    No Data Slots
                </div>
            {/if}
        </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search sensors..."
            class="w-full input-standard px-3 py-2 mb-2"
        />
        {#each filteredHardware as hw}
            <div
                class="bg-transparent border border-white/5 rounded-xl overflow-hidden"
            >
                <button
                    on:click={() => toggleHw(hw.Id)}
                    class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
                >
                    <Cpu size={16} class="text-indigo-400" />
                    <span
                        class="text-sm font-bold text-zinc-300 flex-1 text-left truncate"
                        >{hw.Name}</span
                    >
                    <span
                        class="text-[10px] bg-white/5 border border-white/5 px-1.5 rounded text-zinc-500"
                        >{Object.values(hw.groups).flat().length}</span
                    >
                </button>
                {#if expandedHwId === hw.Id || searchQuery}
                    <div
                        transition:slide={{ duration: 200 }}
                        class="bg-black/10 p-2 grid grid-cols-1 gap-2 border-t border-white/5"
                    >
                        {#each Object.entries(hw.groups) as [type, sensors]}
                            <div class="pl-2">
                                <div
                                    class="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1 mt-2"
                                >
                                    {type}
                                </div>
                                <div class="space-y-1">
                                    {#each sensors as s}
                                        <button
                                            on:click={() => mapSensor(hw.Id, s)}
                                            class="w-full flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all text-left {mapping[
                                                selectedSlotId!
                                            ]?.sensorId === s.Id
                                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                                                : 'bg-transparent border-transparent hover:bg-white/5 text-zinc-400 hover:text-zinc-200'}"
                                        >
                                            <span class="text-xs truncate"
                                                >{s.Name}</span
                                            >
                                            {#if mapping[selectedSlotId!]?.sensorId === s.Id}
                                                <Check
                                                    size={12}
                                                    class="text-emerald-500"
                                                />
                                            {/if}
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
