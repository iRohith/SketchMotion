import type { DemoAction, HoverResponseParams, ShowHoverParams } from '../types';
import {
	showAskHover as showAskHoverFn,
	showResultHover as showResultHoverFn,
	dismissHover as dismissHoverFn,
	handleAskResponse as handleAskResponseFn,
	handleResultFeedback as handleResultFeedbackFn,
	addUserNote as addUserNoteFn,
	triggerAnalysisNow
} from '$lib/stores/analysis.svelte';

// --- Analysis Actions ---

export async function triggerAnalysis(): Promise<void> {
	// Trigger the analysis accumulation manually (for demo mode)
	triggerAnalysisNow();
	// Small delay to allow the hover to appear
	await new Promise((resolve) => setTimeout(resolve, 100));
}

export async function showAskHover(action: DemoAction): Promise<void> {
	const params = action.params as ShowHoverParams | undefined;
	if (!params?.clusterId || !params?.bounds) {
		console.warn('[DemoAction:showAskHover] Missing clusterId or bounds param');
		return;
	}

	// Note: showAskHoverFn returns a promise that resolves when user responds
	// For demo purposes, we just trigger it and don't wait for response
	showAskHoverFn(params.clusterId, params.bounds);
}

export async function showResultHover(action: DemoAction): Promise<void> {
	const params = action.params as ShowHoverParams | undefined;
	if (!params?.clusterId || !params?.bounds || !params?.analysisItemId) {
		console.warn('[DemoAction:showResultHover] Missing required params');
		return;
	}

	showResultHoverFn(
		params.clusterId,
		params.analysisItemId,
		params.bounds,
		params.title ?? 'Analysis Result',
		params.content ?? ''
	);
}

export async function dismissHover(): Promise<void> {
	dismissHoverFn('dismissed');
}

export async function handleAskResponse(action: DemoAction): Promise<void> {
	const params = action.params as HoverResponseParams | undefined;
	if (!params?.response) {
		console.warn('[DemoAction:handleAskResponse] Missing response param');
		return;
	}

	handleAskResponseFn(params.response);
}

export async function handleResultFeedback(action: DemoAction): Promise<void> {
	const params = action.params as HoverResponseParams | undefined;
	if (!params?.response) {
		console.warn('[DemoAction:handleResultFeedback] Missing response param');
		return;
	}

	handleResultFeedbackFn(params.response);
}

export async function addUserNote(action: DemoAction): Promise<void> {
	const params = action.params as { content: string } | undefined;
	if (!params?.content) {
		console.warn('[DemoAction:addUserNote] Missing content param');
		return;
	}

	return new Promise((resolve) => {
		addUserNoteFn(params.content, action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

// --- Export all analysis actions as a map ---

export const analysisActions = {
	triggerAnalysis: async () => triggerAnalysis(),
	showAskHover,
	showResultHover,
	dismissHover: async () => dismissHover(),
	handleAskResponse,
	handleResultFeedback,
	addUserNote
};
