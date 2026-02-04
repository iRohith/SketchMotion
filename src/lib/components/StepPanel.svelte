<script lang="ts">
	import { PipelineState } from '$lib/types';
	import { getPipelineState, setPipelineState } from '$lib/stores/common.svelte';

	const steps = [
		{ id: PipelineState.RECORDING, label: 'Draw', color: 'bg-pink-500' },
		{ id: PipelineState.ANALYZING, label: 'Analysis', color: 'bg-yellow-500' },
		{ id: PipelineState.PROMPTING, label: 'Prompting', color: 'bg-cyan-500' },
		{ id: PipelineState.GENERATING, label: 'Result', color: 'bg-indigo-500' }
	] as const;

	const pipelineState = getPipelineState();
</script>

<div class="h-full w-full p-4 transition-colors">
	<h3
		class="mb-8 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase"
	>
		<span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
		Stage
	</h3>

	<div class="flex w-full flex-row items-center justify-between px-4 pb-4 lg:px-8">
		{#each steps as step, i (step.id)}
			<div class="relative justify-center">
				<button
					data-demo-id={`step-${step.id}`}
					class="
                h-8 w-8 rounded-full border-2 border-white/40 backdrop-blur-sm transition-all
				{step.id <= pipelineState.finishedStep ? 'cursor-pointer' : ''}
                {step.id === pipelineState.selectedStep ? 'ring-2 ring-offset-1' : ''}"
					title={step.label}
					onclick={() => {
						setPipelineState(step.id, `step-${step.id}`);
					}}
				>
					<div
						class="
                        h-full w-full rounded-full
                        {step.id <= pipelineState.finishedStep ? step.color : ''}
                        {step.id === pipelineState.selectedStep
							? '-scale-60 animate-pulse [animation-duration:1s]'
							: '-scale-80'}"
					></div>
				</button>
				<div
					class="
                    absolute left-1/2 mt-2 -translate-x-1/2 text-[10px] tracking-widest whitespace-nowrap text-white/40 uppercase transition-colors
                    {step.id === pipelineState.selectedStep ? 'font-bold text-white/80' : ''}"
				>
					{step.label}
				</div>
			</div>

			{#if i < steps.length - 1}
				<div
					class="h-0.5 flex-1 bg-white/5 {step.id + 1 <= pipelineState.finishedStep
						? 'bg-white/80'
						: ''}"
				></div>
			{/if}
		{/each}
	</div>
</div>
