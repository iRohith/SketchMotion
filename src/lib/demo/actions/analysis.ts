import type { DemoAction, HoverResponseParams, ShowHoverParams } from '../types';
import {
	showAskHover as showAskHoverFn,
	showResultHover as showResultHoverFn,
	dismissHover as dismissHoverFn,
	handleAskResponse as handleAskResponseFn,
	handleResultFeedback as handleResultFeedbackFn,
	addUserNote as addUserNoteFn,
	triggerAnalysisNow,
	analysisHover,
	handleRecreate as handleRecreateFn,
	analysisResults
} from '$lib/stores/analysis.svelte';

const MIN_POPUP_DISPLAY_TIME = 1500;
const MAX_WAIT_TIME = 10000;
const POLL_INTERVAL = 50;

import { strokes, calculateBoundingBox } from '$lib/stores/canvas.svelte';
import { moveCursorToElement, waitForTarget } from '$lib/stores/demoCursor.svelte';

export async function triggerAnalysis(): Promise<void> {
	// 1. Capture current state BEFORE triggering new analysis
	const initialHover = analysisHover.current;
	const initialVisible = initialHover?.visible;
	const initialId = initialHover?.clusterId;

	// 2. Trigger the analysis logic
	triggerAnalysisNow();

	const maxWait = MAX_WAIT_TIME;
	const startTime = Date.now();

	// 3. If a popup was ALREADY visible, wait for it to change or disappear
	if (initialVisible && initialId) {
		console.log(`[Demo] Waiting for previous popup (${initialId}) to dismiss/change...`);
		while (Date.now() - startTime < maxWait) {
			const current = analysisHover.current;
			// If popup is gone OR ID changed, we are good to proceed
			if (!current?.visible || current.clusterId !== initialId) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
		}
	}

	// 4. Standard wait: Wait for A popup (presumably the new one) to appear
	while (!analysisHover.current?.visible && Date.now() - startTime < maxWait) {
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
	}

	await new Promise((resolve) => setTimeout(resolve, 100));
}

export async function showAskHover(action: DemoAction): Promise<void> {
	const params = action.params as ShowHoverParams | undefined;
	if (!params?.clusterId || !params?.bounds) {
		console.warn('[DemoAction:showAskHover] Missing clusterId or bounds param');
		return;
	}

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

	const popupShownAt = Date.now();

	await handleAskResponseFn(params.response);

	if (params.response === 'yes') {
		const timeSinceShown = Date.now() - popupShownAt;
		const minWait = Math.max(0, MIN_POPUP_DISPLAY_TIME - timeSinceShown);
		if (minWait > 0) {
			await new Promise((resolve) => setTimeout(resolve, minWait));
		}

		const maxWait = MAX_WAIT_TIME;
		const startTime = Date.now();
		while (Date.now() - startTime < maxWait) {
			if (analysisHover.current?.visible && analysisHover.current?.type === 'result') {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
		}

		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

export async function handleResultFeedback(action: DemoAction): Promise<void> {
	const params = action.params as HoverResponseParams | undefined;
	if (!params?.response) {
		console.warn('[DemoAction:handleResultFeedback] Missing response param');
		return;
	}

	// Visual Click Logic
	const current = analysisHover.current;
	if (current?.visible && current.type === 'result' && current.clusterId) {
		const btnId = `hover-feedback-${params.response}-${current.clusterId}`;
		const found = await waitForTarget(btnId, 2000);
		if (found) {
			await moveCursorToElement(btnId, { duration: 800, action: 'click' });
			// Small pause after click
			await new Promise((r) => setTimeout(r, 200));
		}
	} else {
		// Fallback delay if popup not ready/visible
		await new Promise((r) => setTimeout(r, 800));
	}

	const popupShownAt = Date.now();

	const timeSinceShown = Date.now() - popupShownAt;
	// We already spent time moving cursor, so this minWait likely 0
	const minWait = Math.max(0, MIN_POPUP_DISPLAY_TIME - timeSinceShown);
	if (minWait > 0) {
		await new Promise((resolve) => setTimeout(resolve, minWait));
	}

	await handleResultFeedbackFn(params.response);

	if (params.response === 'no') {
		const maxWait = MAX_WAIT_TIME;
		const startTime = Date.now();
		while (Date.now() - startTime < maxWait) {
			if (analysisHover.current?.visible && analysisHover.current?.type === 'ask') {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
		}

		await new Promise((resolve) => setTimeout(resolve, 100));
	}
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

// Manual Analysis Actions
import { captureCanvasWithHighlights } from '$lib/demo/utils/canvasCapture';
import { addLoadingItem, setItemSuccess, setItemError } from '$lib/stores/analysis.svelte';
// Note: calculateBoundingBox and strokes are already imported at top of file

export async function showManualAskHover(action: DemoAction): Promise<void> {
	const params = action.params as { groupId: string; strokeIds: string[] };
	if (!params?.groupId || !params?.strokeIds) {
		console.warn('[DemoAction] Missing params for showManualAskHover');
		return;
	}

	// Dismiss any existing hover first
	dismissHoverFn('dismissed');

	// Calculate bounds
	const groupStrokes = params.strokeIds.map((id) => strokes.get(id)).filter((s) => s !== undefined);
	const bounds = calculateBoundingBox(groupStrokes);

	if (bounds) {
		// 1. Show Ask Hover
		// We don't await the result here because we might ignore it (Hill)
		showAskHoverFn(params.groupId, bounds);
	}
}

export async function performFullManualAnalysis(action: DemoAction): Promise<void> {
	const params = action.params as { groupId: string; strokeIds: string[]; isRetry?: boolean };
	if (!params?.groupId || !params?.strokeIds) return;

	// 1. Show Ask Hover
	await showManualAskHover(action);

	// 2. visually click "Yes"
	const askYesId = `hover-ask-yes-${params.groupId}`;
	const found = await waitForTarget(askYesId, 2000);

	if (found) {
		await moveCursorToElement(askYesId, { duration: 800, action: 'click' });
	} else {
		// Fallback wait if element not found (shouldn't happen)
		await new Promise((r) => setTimeout(r, 1000));
	}

	// 3. Simulate "Yes" logic
	dismissHoverFn('yes');

	// 4. Create Loading Item
	const groupStrokes = params.strokeIds.map((id) => strokes.get(id)).filter((s) => s !== undefined);
	const bounds = calculateBoundingBox(groupStrokes);
	const analysisId = addLoadingItem(params.groupId, bounds ?? undefined);

	try {
		// 5. Capture Canvas
		const { intentImage, contextImage } = await captureCanvasWithHighlights(
			new Set(params.strokeIds)
		);

		// 6. Call API
		const response = await fetch('/api/demo/analyze-group', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				intentImage,
				contextImage,
				groupId: params.groupId,
				timestamp: Date.now(),
				isRetry: params.isRetry,
				existingGroups: [
					{
						groupId: params.groupId,
						strokeIds: params.strokeIds,
						color: groupStrokes[0]?.color || '#000000'
					}
				]
			})
		});

		const data = await response.json();

		// 7. Update Results
		if (data.success) {
			setItemSuccess(
				analysisId,
				data.title,
				data.content,
				data.objectId,
				intentImage,
				bounds ?? undefined,
				contextImage
			);

			// 8. Show Result Hover
			if (bounds) {
				showResultHoverFn(params.groupId, analysisId, bounds, data.title, data.content);
			}
		} else {
			setItemError(analysisId, data.error || 'Analysis failed');
		}
	} catch (e) {
		console.error('Manual Analysis Failed', e);
		setItemError(analysisId, 'Manual Analysis Failed');
	}
}

export async function triggerRecreate(action: DemoAction): Promise<void> {
	const params = action.params as { groupId: string };
	if (!params?.groupId) {
		console.warn('[DemoAction:triggerRecreate] Missing groupId param');
		return;
	}

	// Find the latest analysis item for this group
	const item = analysisResults.items
		.filter((i) => i.clusterId === params.groupId && i.status === 'success')
		.pop();

	if (!item) {
		console.warn(`[DemoAction:triggerRecreate] No success item found for group ${params.groupId}`);
		return;
	}

	console.log(
		`[DemoAction:triggerRecreate] Recreating item ${item.id} for group ${params.groupId}`
	);
	await handleRecreateFn(item.id);
}

export const analysisActions = {
	triggerAnalysis: async () => triggerAnalysis(),
	showAskHover,
	showResultHover,
	dismissHover: async () => dismissHover(),
	handleAskResponse,
	handleResultFeedback,
	addUserNote,
	showManualAskHover,
	performFullManualAnalysis,
	triggerRecreate
};
