<script lang="ts">
	import { Pen, Play, Power } from '@lucide/svelte';
	import { demoCursor, showCursor, hideCursor } from '$lib/stores/demoCursor.svelte';

	function toggleDemo() {
		if (demoCursor.visible) {
			hideCursor();
		} else {
			if (typeof window !== 'undefined') {
				demoCursor.x = window.innerWidth / 2;
				demoCursor.y = window.innerHeight / 2;
			}
			showCursor();
		}
	}
</script>

<header class="glass-panel flex w-full items-center">
	<div class="flex h-full w-full items-center justify-between border-white/10 bg-black/20 p-4">
		<div class="flex items-center gap-4">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-tr from-pink-500 to-orange-400 shadow-lg shadow-pink-500/20"
			>
				<Pen />
			</div>
			<div>
				<h1
					class="bg-linear-to-r from-white to-white/60 bg-clip-text text-2xl font-bold text-transparent"
				>
					SketchMotion
				</h1>
				<p class="text-xs text-white/40">Sketch to motion</p>
			</div>
		</div>

		<button
			onclick={toggleDemo}
			class="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-95 {demoCursor.visible
				? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
				: 'border-red-500/30 bg-red-500/20 text-red-300 hover:bg-red-500/30'}"
		>
			<span>{demoCursor.visible ? 'Demo Active' : 'Demo Off'}</span>
			{#if demoCursor.visible}
				<Power size={14} class="animate-pulse" />
			{:else}
				<Play size={14} fill="currentColor" />
			{/if}
		</button>
	</div>
</header>
