<script lang="ts">
	import { pipelineState } from '$lib/stores/common.svelte';
	import { PipelineState } from '$lib/types';
	import Analysis from './Analysis.svelte';
</script>

<div class="h-full w-full">
	{#if pipelineState.selectedStep === PipelineState.RECORDING}
		<!-- <CanvasRec /> -->
	{:else if pipelineState.selectedStep === PipelineState.ANALYZING}
		<Analysis />
	{:else if pipelineState.selectedStep === PipelineState.PROMPTING}
		<!-- <Prompting /> -->
	{:else if pipelineState.selectedStep === PipelineState.GENERATING}
		<!-- <Result /> -->
	{/if}
</div>
