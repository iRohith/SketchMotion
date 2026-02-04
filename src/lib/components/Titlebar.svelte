<script lang="ts">
	import { Pen } from '@lucide/svelte';
</script>

<header class="glass-panel flex w-full items-center">
	<div class="flex h-full w-full items-center gap-4 border-white/10 bg-black/20 p-4">
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
</header>
