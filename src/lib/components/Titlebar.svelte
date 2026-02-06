<script lang="ts">
	import { Pen, Play, Square } from '@lucide/svelte';
	import { demoCursor } from '$lib/stores/demoCursor.svelte';
	import { runScenario, stopScenario, demoRunnerState, registerAllActions } from '$lib/demo';
	import { quickDrawDemo } from '$lib/demo/scenarios';
	import { onMount } from 'svelte';

	// Register all demo actions on mount
	onMount(() => {
		registerAllActions();
	});

	async function runDemo() {
		if (demoRunnerState.isRunning) {
			stopScenario();
		} else {
			// Center cursor before starting
			if (typeof window !== 'undefined') {
				demoCursor.x = window.innerWidth / 2;
				demoCursor.y = window.innerHeight / 2;
			}
			await runScenario(quickDrawDemo);
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

		<div class="flex items-center gap-2">
			<button
				onclick={runDemo}
				class="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-95 {demoRunnerState.isRunning
					? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
					: 'border-purple-500/30 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'}"
				data-demo-id="demo-button"
			>
				{#if demoRunnerState.isRunning}
					<Square size={14} fill="currentColor" />
					<span>Stop Demo</span>
				{:else}
					<Play size={14} fill="currentColor" />
					<span>Demo</span>
				{/if}
			</button>
		</div>
	</div>
</header>
