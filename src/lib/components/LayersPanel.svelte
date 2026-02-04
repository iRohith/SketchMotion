<script lang="ts">
	import { Layer } from '$lib/types';

	import { setActiveLayer, getActiveLayer } from '$lib/stores/canvas.svelte';

	const layers = [
		{ id: Layer.BACKGROUND, label: 'Background' },
		{ id: Layer.START, label: 'Start' },
		{ id: Layer.END, label: 'End' }
	] as const;

	const activeLayer = $derived(getActiveLayer());
</script>

<div class="h-full w-full p-4">
	<h3
		class="mb-8 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase"
	>
		<span class="h-1.5 w-1.5 rounded-full bg-white/50"></span>
		Layers
	</h3>

	<div class="flex w-full flex-row items-center justify-between px-4 pb-4 lg:px-8">
		{#each layers as layer, i (layer.id)}
			<div class="relative justify-center">
				<button
					class="
                h-8 w-8 cursor-pointer rounded-full border-2 border-white/40 backdrop-blur-sm transition-all
                {layer.id === activeLayer ? 'ring-2 ring-offset-1' : ''}"
					title={layer.label}
					onclick={() => {
						setActiveLayer(layer.id, `layer-${layer.id}`);
					}}
					data-demo-id="layer-{layer.id}"
				>
					<div
						class="
                        h-full w-full rounded-full
                        {layer.id === activeLayer
							? '-scale-60 animate-pulse [animation-duration:1s]'
							: ''}"
					></div>
				</button>
				<div
					class="
                    absolute left-1/2 mt-2 -translate-x-1/2 text-[10px] tracking-widest whitespace-nowrap text-white/40 uppercase transition-colors
                    {layer.id === activeLayer ? 'font-bold text-white/80' : ''}"
				>
					{layer.label}
				</div>
			</div>

			{#if i < layers.length - 1}
				<div class="h-0.5 flex-1 bg-white/5"></div>
			{/if}
		{/each}
	</div>
</div>
