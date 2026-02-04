<script lang="ts">
	import CanvasPanel from '$lib/components/canvas/CanvasPanel.svelte';
	import CanvasToolbar from '$lib/components/canvas/CanvasToolbar.svelte';
	import DemoCursor from '$lib/components/DemoCursor.svelte';
	import LayersPanel from '$lib/components/LayersPanel.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import StepPanel from '$lib/components/StepPanel.svelte';
	import Titlebar from '$lib/components/Titlebar.svelte';
	import WorkspacePanel from '$lib/components/workspace/WorkspacePanel.svelte';
</script>

<DemoCursor />

<div class="flex h-full w-full flex-col p-3 lg:h-screen lg:w-screen">
	<Titlebar />

	<main
		class="flex h-full min-h-0 w-full flex-1 flex-col gap-3 pt-3 lg:grid lg:grid-cols-[3fr_2fr] lg:grid-rows-[7fr_3fr]"
	>
		<!-- Row 1: both columns aligned -->
		<div class="glass-panel order-1 aspect-4/3 lg:relative lg:order-0 lg:aspect-auto lg:h-auto">
			<div
				class="flex h-full w-full items-center justify-center border-white/10 bg-black/20 lg:absolute lg:inset-0 lg:h-full lg:w-full"
			>
				<CanvasPanel />
			</div>
		</div>
		<div class="glass-panel order-3 aspect-4/3 lg:relative lg:order-0 lg:aspect-auto lg:h-auto">
			<div
				class="flex h-full w-full items-center justify-center border-white/10 bg-black/20 lg:absolute lg:inset-0 lg:h-full lg:w-full"
			>
				<WorkspacePanel />
			</div>
		</div>
		<!-- Row 2: left column split 40/60, right column single -->
		<div class="order-2 flex min-h-0 flex-col gap-3 lg:order-0 lg:grid lg:grid-rows-[2fr_3fr]">
			<div class="glass-panel lg:relative">
				<div
					class="h-fit border-white/10 bg-black/20 lg:absolute lg:inset-0 lg:flex lg:h-full lg:items-center lg:justify-center"
				>
					<CanvasToolbar />
				</div>
			</div>
			<div class="flex flex-col gap-3 lg:grid lg:grid-cols-2">
				<div class="glass-panel lg:relative">
					<div
						class="h-fit border-white/10 bg-black/20 lg:absolute lg:inset-0 lg:flex lg:h-full lg:items-center lg:justify-center"
					>
						<LayersPanel />
					</div>
				</div>
				<div class="glass-panel lg:relative">
					<div
						class="h-fit border-white/10 bg-black/20 lg:absolute lg:inset-0 lg:flex lg:h-full lg:items-center lg:justify-center"
					>
						<StepPanel />
					</div>
				</div>
			</div>
		</div>
		<div class="glass-panel order-4 lg:relative lg:order-0">
			<div
				class="h-fit border-white/10 bg-black/20 lg:absolute lg:inset-0 lg:flex lg:h-full lg:items-center lg:justify-center"
			>
				<SettingsPanel />
			</div>
		</div>
	</main>

	<!-- Background decorations -->
	<div class="pointer-events-none fixed inset-0 -z-999 h-full w-full">
		<div
			class="absolute top-[-10%] left-[-10%] h-125 w-125 rounded-full bg-purple-900/30 blur-[128px]"
		></div>
		<div
			class="absolute right-[-10%] bottom-[-20%] h-150 w-150 rounded-full bg-pink-900/20 blur-[128px]"
		></div>
	</div>
</div>
