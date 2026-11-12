<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { isDoomModalOpen } from "#lib/stores/doomStore.ts";
    import { DOOM } from "wasm-doom";
    import { X, Gamepad2 } from "@lucide/svelte";

    let doomCanvas: HTMLCanvasElement;
    let doomCtx: CanvasRenderingContext2D;

    // Offscreen LCD canvas to scale to 480x480 and send to Tauri
    let lcdCanvas: HTMLCanvasElement | null = null;
    let lcdCtx: CanvasRenderingContext2D | null = null;

    let doomGame: any = null;
    let doomWasm: any = null;
    let isLoaded = false;
    let isFailed = false;
    let isSending = false;
    let doomLoopId: number;

    let useWasd = true;
    let hardcoreMode = false;

    function mapDoomKeyCode(keyCode: number, key: string): number | null {
        const keyLower = key.toLowerCase();

        // If WASD movement is enabled, map them to Doom's arrow keys.
        // Otherwise, they fall back to standard letters so you can type save names.
        if (useWasd) {
            if (keyLower === "w") return 173; // Up Arrow (Forward)
            if (keyLower === "s") return 175; // Down Arrow (Backward)
            if (keyLower === "a") return 172; // Left Arrow (Turn Left)
            if (keyLower === "d") return 174; // Right Arrow (Turn Right)
        }

        switch (keyLower) {
            case "arrowup":
                return 173; // Up Arrow (Forward)
            case "arrowdown":
                return 175; // Down Arrow (Backward)
            case "arrowleft":
                return 172; // Left Arrow (Turn Left)
            case "arrowright":
                return 174; // Right Arrow (Turn Right)
            case "control":
                return 157; // Ctrl (Fire)
            case " ":
                return 32; // Space (Use)
            case "enter":
                return 13; // Enter (Select)
            case "backspace":
                return 127; // Backspace (Delete)
            case "escape":
                return 27; // Esc (Doom Menu)
            case "m":
                return 27; // Map 'm' to Esc
            default:
                if (keyCode >= 49 && keyCode <= 55) {
                    return keyCode; // 1-7 weapons
                }
                if (keyCode >= 65 && keyCode <= 90) {
                    return keyCode + 32; // basic letters
                }
                return null;
        }
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (!isLoaded || !doomWasm) return;

        const doomCode = mapDoomKeyCode(e.keyCode, e.key);
        if (doomCode !== null) {
            doomWasm.instance.exports.add_browser_event(0, doomCode);
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function handleKeyUp(e: KeyboardEvent) {
        if (!isLoaded || !doomWasm) return;

        const doomCode = mapDoomKeyCode(e.keyCode, e.key);
        if (doomCode !== null) {
            doomWasm.instance.exports.add_browser_event(1, doomCode);
            e.preventDefault();
            e.stopPropagation();
        }
    }

    async function initDoom() {
        try {
            doomCtx = doomCanvas.getContext("2d", { alpha: false })!;

            // Setup offscreen LCD canvas
            lcdCanvas = document.createElement("canvas");
            lcdCanvas.width = 480;
            lcdCanvas.height = 480;
            lcdCtx = lcdCanvas.getContext("2d", { alpha: false })!;

            doomGame = new DOOM({
                screenWidth: 640,
                screenHeight: 400,
                wasmURL: "/doom.wasm",
                onFrameRender: ({ screen }) => {
                    if (doomCtx) {
                        const imgData = new ImageData(screen, 640, 400);
                        doomCtx.putImageData(imgData, 0, 0);
                    }

                    // Render scaled to LCD canvas (letterboxed: 480x300 centered on 480x480)
                    if (lcdCtx && lcdCanvas && doomCanvas) {
                        lcdCtx.fillStyle = "#000000";
                        lcdCtx.fillRect(0, 0, 480, 480);
                        lcdCtx.drawImage(doomCanvas, 0, 90, 480, 300);

                        // Stream scaled frame to physical LCD display
                        if (!isSending) {
                            isSending = true;
                            lcdCanvas.toBlob(
                                async (blob) => {
                                    if (blob) {
                                        try {
                                            const buffer =
                                                await blob.arrayBuffer();
                                            await invoke("send_frame", {
                                                jpegData: new Uint8Array(
                                                    buffer,
                                                ),
                                            });
                                        } catch (e) {}
                                    }
                                    isSending = false;
                                },
                                "image/jpeg",
                                0.9,
                            );
                        }
                    }
                },
            });

            doomWasm = await doomGame.loadGame();
            doomWasm.instance.exports.main();
            isLoaded = true;

            // Start step loop
            const step = () => {
                if (!doomWasm) return;
                try {
                    doomWasm.instance.exports.doom_loop_step();
                } catch (e) {
                    console.error("Doom step failed", e);
                }
                doomLoopId = requestAnimationFrame(step);
            };
            doomLoopId = requestAnimationFrame(step);
        } catch (err) {
            console.error("Doom initialization failed:", err);
            isFailed = true;
        }
    }

    function closeModal() {
        isDoomModalOpen.set(false);
    }

    onMount(() => {
        initDoom();
        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("keyup", handleKeyUp, true);
    });

    onDestroy(() => {
        cancelAnimationFrame(doomLoopId);
        window.removeEventListener("keydown", handleKeyDown, true);
        window.removeEventListener("keyup", handleKeyUp, true);

        // Clear all canvas resources
        doomWasm = null;
        doomGame = null;
        lcdCanvas = null;
        lcdCtx = null;
    });
</script>

<!-- Modal Container -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
    on:click|self={closeModal}
>
    <div
        class="bg-zinc-950 border border-red-500/40 rounded-2xl w-[900px] max-w-[95vw] shadow-[0_0_50px_rgba(239,68,68,0.2)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
    >
        <!-- Modal Header -->
        <div
            class="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-zinc-900 bg-white/5"
        >
            <h2
                class="text-sm font-bold text-red-500 flex items-center gap-2 font-mono tracking-wider uppercase"
            >
                <Gamepad2 size={18} class="text-red-500" />
                DOOM
            </h2>
            <button
                on:click={closeModal}
                class="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Close Game"
            >
                <X size={18} />
            </button>
        </div>

        <!-- Modal Body -->
        <div class="p-6 flex flex-col md:flex-row gap-6 items-center">
            <!-- Game Canvas Frame -->
            <div
                class="bg-black p-3 rounded-xl border border-zinc-800 shadow-inner flex items-center justify-center shrink-0 relative"
            >
                <canvas
                    bind:this={doomCanvas}
                    width={640}
                    height={400}
                    class="rounded-lg shadow-2xl block bg-black border border-zinc-900 transition-all duration-300 {hardcoreMode
                        ? 'blur-md opacity-30 scale-95 pointer-events-none'
                        : ''}"
                    style="image-rendering: pixelated; width: 540px; height: 338px;"
                ></canvas>
                {#if hardcoreMode}
                    <div
                        class="absolute inset-0 flex flex-col items-center justify-center text-center p-4 rounded-xl animate-in fade-in duration-300"
                    >
                        <span
                            class="text-xs font-mono font-bold text-red-500 tracking-widest uppercase animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                        >
                            HARDCORE MODE ACTIVE
                        </span>
                        <span
                            class="text-[9px] font-mono text-zinc-400 uppercase mt-2 max-w-[200px] leading-relaxed"
                        >
                            PLAY ON THE AIO SCREEN!
                        </span>
                    </div>
                {/if}
            </div>

            <!-- Dashboard / Instructions -->
            <div class="flex-1 flex flex-col self-stretch py-2 min-w-[200px]">
                <h4
                    class="font-mono font-bold text-xs text-red-400 uppercase tracking-widest mb-3"
                >
                    Controls Info
                </h4>

                <div class="space-y-2 font-mono text-xs text-zinc-400">
                    <div
                        class="flex justify-between border-b border-zinc-900 pb-1.5"
                    >
                        <span class="text-zinc-500">Move Forward/Back</span>
                        <span class="text-red-400">W / S / Arrow Keys</span>
                    </div>
                    <div
                        class="flex justify-between border-b border-zinc-900 pb-1.5"
                    >
                        <span class="text-zinc-500">Turn Left/Right</span>
                        <span class="text-red-400">A / D / Arrow Keys</span>
                    </div>
                    <div
                        class="flex justify-between border-b border-zinc-900 pb-1.5"
                    >
                        <span class="text-zinc-500">Fire Weapon</span>
                        <span class="text-red-400">Left Control</span>
                    </div>
                    <div
                        class="flex justify-between border-b border-zinc-900 pb-1.5"
                    >
                        <span class="text-zinc-500">Open Doors/Use</span>
                        <span class="text-red-400">Spacebar</span>
                    </div>
                    <div
                        class="flex justify-between border-b border-zinc-900 pb-1.5"
                    >
                        <span class="text-zinc-500">Game Menu</span>
                        <span class="text-red-400">M / Escape</span>
                    </div>
                    <div
                        class="flex justify-between border-b border-zinc-900 pb-1.5"
                    >
                        <span class="text-zinc-500">Switch Weapons</span>
                        <span class="text-red-400">Keys 1 - 7</span>
                    </div>
                    <div
                        class="flex justify-between items-center border-b border-zinc-900 pb-1.5 pt-1"
                    >
                        <span class="text-zinc-500">Movement Mode</span>
                        <div
                            class="flex bg-zinc-900/60 rounded-lg p-0.5 border border-zinc-800 shrink-0"
                        >
                            <button
                                on:click={() => (useWasd = true)}
                                class="px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-all {useWasd
                                    ? 'bg-red-950/40 text-red-400 border border-red-500/25 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-400 border border-transparent'}"
                            >
                                WASD
                            </button>
                            <button
                                on:click={() => (useWasd = false)}
                                class="px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-all {!useWasd
                                    ? 'bg-red-950/40 text-red-400 border border-red-500/25 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-400 border border-transparent'}"
                            >
                                ARROWS
                            </button>
                        </div>
                    </div>

                    <div
                        class="flex justify-between items-center border-b border-zinc-900 pb-1.5 pt-1"
                    >
                        <span class="text-zinc-500">Hardcore Mode</span>
                        <button
                            on:click={() => (hardcoreMode = !hardcoreMode)}
                            class="px-3 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-all {hardcoreMode
                                ? 'bg-red-600 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-red-500'
                                : 'bg-zinc-900/60 text-zinc-500 hover:text-zinc-400 border border-zinc-800'}"
                        >
                            {hardcoreMode ? "ACTIVE" : "OFF"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
