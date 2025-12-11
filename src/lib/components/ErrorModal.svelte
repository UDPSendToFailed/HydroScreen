<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { fade, scale } from 'svelte/transition';
    import { Ban } from 'lucide-svelte';

    export let title = "Import Failed";
    export let message = "An unknown error occurred.";
    
    const dispatch = createEventDispatcher();

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' || e.key === 'Enter') dispatch('close');
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) node.parentNode.removeChild(node);
            }
        };
    }
</script>

<div 
    use:portal
    class="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-8 outline-none"
    transition:fade={{ duration: 150 }}
    on:click|self={() => dispatch('close')}
    on:keydown={handleKeydown}
    role="button"
    tabindex="0"
>
    <div 
        class="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center"
        transition:scale={{ duration: 150, start: 0.95 }}
        role="dialog"
    >
        <div class="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
            <Ban size={24} />
        </div>
        
        <h3 class="text-lg font-bold text-white mb-2">{title}</h3>
        <p class="text-sm text-zinc-400 mb-6 leading-relaxed font-mono bg-black/20 p-3 rounded-lg border border-white/5 break-words text-left">
            {message}
        </p>

        <button 
            on:click={() => dispatch('close')}
            class="w-full px-6 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors border border-white/5"
        >
            Dismiss
        </button>
    </div>
</div>