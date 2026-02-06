import { PipelineState } from '$lib/types';
import { moveCursorToElement, type CursorOptions } from './demoCursor.svelte';

export const pipelineState = $state({
	selectedStep: PipelineState.ANALYZING,
	finishedStep: PipelineState.COMPLETE
});

export function setPipelineState(
	state: PipelineState,
	elementId?: string,
	options?: CursorOptions
) {
	if (state > pipelineState.finishedStep) return;
	moveCursorToElement(elementId, {
		onComplete: () => {
			pipelineState.selectedStep = state;
		},
		...options
	});
}

export function getPipelineState() {
	return pipelineState;
}
