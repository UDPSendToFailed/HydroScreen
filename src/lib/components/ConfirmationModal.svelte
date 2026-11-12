<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { AlertTriangle } from "@lucide/svelte";

    export let title = "Confirm Action";
    export let message = "Are you sure you want to proceed?";
    export let confirmText = "Delete";
    export let variant: 'danger' | 'info' = 'danger';

    const dispatch = createEventDispatcher();

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") dispatch("cancel");
        if (e.key === "Enter") dispatch("confirm");
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) node.parentNode.removeChild(node);
            },
        };
    }
</script>

<div
    use:portal
    class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 outline-none"
    transition:fade={{ duration: 150 }}
    on:click|self={() => dispatch("cancel")}
    on:keydown={handleKeydown}
    role="presentation"
>
    <div
        class="glass-modal w-full max-w-sm p-6 text-center"
        transition:scale={{ duration: 150, start: 0.95 }}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
    >
        <div
            class="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"
        >
            <AlertTriangle size={24} />
        </div>

        <h3 class="text-lg font-bold text-white mb-2">{title}</h3>
        <p class="text-sm text-zinc-400 mb-6 leading-relaxed">
            {message}
        </p>

        <div class="grid grid-cols-2 gap-3">
            <button
                on:click={() => dispatch("cancel")}
                class="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 font-medium transition-colors"
            >
                Cancel
            </button>
            <button
                on:click={() => dispatch("confirm")}
                class="px-2 py-2 rounded-lg text-white font-bold transition-colors shadow-lg {variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20'
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20'}"
            >
                {confirmText}
            </button>
        </div>
    </div>
</div>
