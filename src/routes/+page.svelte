<script lang="ts">
	import CanvasPanel from '$lib/components/canvas/CanvasPanel.svelte';
	import CanvasToolbar from '$lib/components/canvas/CanvasToolbar.svelte';
	import DemoCursor from '$lib/components/DemoCursor.svelte';
	import AutoAnalysis from '$lib/components/workspace/AutoAnalysis.svelte';
	import Titlebar from '$lib/components/Titlebar.svelte';
	import WorkspacePanel from '$lib/components/workspace/WorkspacePanel.svelte';
	import { demoRunnerState } from '$lib/stores/demoRunner.svelte';
</script>

<DemoCursor />
<AutoAnalysis />

<div class="flex h-full w-full flex-col p-3 lg:h-screen lg:w-screen">
	<Titlebar />

	<main
		class="flex h-full min-h-0 w-full flex-col gap-3 pt-3 lg:flex-row"
		class:pointer-events-none={demoRunnerState.isRunning}
	>
		<!-- Left layout -->
		<div class="flex aspect-4/3 w-full flex-col gap-3 lg:aspect-auto lg:w-[60%]">
			<!-- Canvas -->
			<div class="glass-panel relative flex-1">
				<div
					class="absolute inset-0 flex h-full w-full items-center justify-center border-white/10 bg-black/20"
				>
					<CanvasPanel />
				</div>
			</div>

			<!-- Toolbar -->
			<div class="glass-panel relative">
				<div class="flex h-fit w-full items-center justify-center border-white/10 bg-black/20">
					<CanvasToolbar />
				</div>
			</div>
		</div>

		<!-- WorkspacePanel -->
		<div class="glass-panel relative aspect-4/3 w-full lg:aspect-auto lg:w-[40%]">
			<div
				class="absolute inset-0 flex h-full w-full items-center justify-center border-white/10 bg-black/20"
			>
				<WorkspacePanel />
			</div>
		</div>
	</main>

	<div class="pointer-events-none fixed inset-0 -z-999 h-full w-full">
		<div
			class="absolute top-[-10%] left-[-10%] h-125 w-125 rounded-full bg-purple-900/30 blur-[128px]"
		></div>
		<div
			class="absolute right-[-10%] bottom-[-20%] h-150 w-150 rounded-full bg-pink-900/20 blur-[128px]"
		></div>
	</div>
</div>
