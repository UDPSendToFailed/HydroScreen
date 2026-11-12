<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { onMount, onDestroy } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { ShieldAlert, X } from "@lucide/svelte";
    import { isSensorless } from "#lib/stores/sensors.ts";

    let showDialog = false;
    let errorMessage = "";
    let unlisten: (() => void) | null = null;

    onMount(async () => {
        unlisten = await listen<string>("sidecar-error", (event) => {
            console.error("Sidecar Error Received:", event.payload);
            errorMessage = event.payload;
            showDialog = true;
        });
    });

    onDestroy(() => {
        unlisten?.();
    });

    function dismiss() {
        showDialog = false;
    }

    function runSensorless() {
        showDialog = false;
        isSensorless.set(true);
    }

    async function retrySidecar() {
        showDialog = false;
        try {
            await invoke("retry_sidecar", { debugMode: false });
        } catch (e) {
            console.error("Failed to retry sidecar:", e);
            errorMessage = "Retry failed to send command.";
            showDialog = true;
        }
    }
</script>

{#if showDialog}
    <div
        class="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 outline-none"
        role="presentation"
        on:click={dismiss}
        transition:fade={{ duration: 200 }}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
            class="glass-modal w-full max-w-sm p-6 text-center relative"
            transition:scale={{ duration: 200, start: 0.95 }}
            role="alertdialog"
            aria-modal="true"
            aria-label="Admin access required"
            tabindex="-1"
            on:click|stopPropagation
        >
            <button
                on:click={dismiss}
                class="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
                aria-label="Dismiss"
            >
                <X size={16} />
            </button>

            <div
                class="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"
            >
                <ShieldAlert size={24} />
            </div>

            <h2 class="text-lg font-bold text-white mb-2">
                Admin Access Required
            </h2>
            <p
                class="text-zinc-400 text-sm mb-4 leading-relaxed font-mono bg-black/20 p-3 rounded-lg border border-white/5 break-words text-left"
            >
                The sensor bridge needs administrator privileges to read
                hardware sensors. When prompted, click <strong class="text-zinc-300">Yes</strong> on the
                Windows UAC dialog to grant access.
                {#if errorMessage}
                    <br /><br />
                    <span class="text-red-400">Error: {errorMessage}</span>
                {/if}
            </p>

            <div class="flex gap-3">
                <button
                    on:click={runSensorless}
                    class="flex-1 px-6 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium transition-colors"
                >
                    Continue Without Sensors
                </button>
                <button
                    on:click={retrySidecar}
                    class="flex-1 px-6 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors shadow-lg shadow-red-500/20"
                >
                    Try Again
                </button>
            </div>
        </div>
    </div>
{/if}
