import {
	moveCursorToElement,
	demoCursor,
	queueAction,
	waitForTarget,
	type CursorOptions
} from './demoCursor.svelte';
import { canvasToScreen } from '$lib/utils/demoStroke';

// --- Hover Types & State ---

export type CanvasHover = {
	type: 'ask' | 'result';
	clusterId: string;
	analysisItemId?: string;
	position: { x: number; y: number };
	title?: string;
	content?: string;
	visible: boolean;
};

export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };

export const analysisHover = $state<{
	current: CanvasHover | null;
	askResolve: ((result: 'yes' | 'no' | 'dismissed') => void) | null;
}>({
	current: null,
	askResolve: null
});

// --- Manual Analysis Trigger (for demo mode) ---

let manualTriggerCallback: (() => void) | null = null;

/**
 * Register a callback to be called when triggerAnalysisNow is invoked.
 * The AutoAnalysis component registers its runAccumulation function here.
 */
export function registerAnalysisTrigger(callback: () => void) {
	manualTriggerCallback = callback;
}

/**
 * Unregister the analysis trigger callback.
 */
export function unregisterAnalysisTrigger() {
	manualTriggerCallback = null;
}

/**
 * Trigger analysis immediately (for demo mode).
 * This calls the registered callback (runAccumulation from AutoAnalysis).
 */
export function triggerAnalysisNow(): boolean {
	if (manualTriggerCallback) {
		manualTriggerCallback();
		return true;
	}
	console.warn('[Analysis] No trigger callback registered');
	return false;
}

// --- Hover Timeout Management ---

const HOVER_TIMEOUT = 5000;
let hoverTimeoutId: ReturnType<typeof setTimeout> | null = null;

function startHoverTimeout() {
	if (hoverTimeoutId) clearTimeout(hoverTimeoutId);
	hoverTimeoutId = setTimeout(() => {
		dismissHover('dismissed');
	}, HOVER_TIMEOUT);
}

export function pauseHoverTimeout() {
	if (hoverTimeoutId) {
		clearTimeout(hoverTimeoutId);
		hoverTimeoutId = null;
	}
}

export function resumeHoverTimeout() {
	if (analysisHover.current && analysisHover.current.visible) {
		startHoverTimeout();
	}
}

function getHoverPosition(bounds: BoundingBox): { x: number; y: number } {
	// Position at bottom-center of the bounding box, converted to screen coords
	const canvasPoint = {
		x: (bounds.minX + bounds.maxX) / 2,
		y: bounds.maxY + 15
	};

	const screenPoint = canvasToScreen(canvasPoint);
	if (screenPoint) {
		return {
			x: Math.max(10, Math.min(screenPoint.x, window.innerWidth - 220)),
			y: Math.min(screenPoint.y, window.innerHeight - 120)
		};
	}

	// Fallback if canvas element not found
	return { x: 100, y: 100 };
}

// --- Hover Trigger Functions ---

export function showAskHover(
	clusterId: string,
	bounds: BoundingBox
): Promise<'yes' | 'no' | 'dismissed'> {
	return new Promise((resolve) => {
		analysisHover.askResolve = resolve;
		const position = getHoverPosition(bounds);
		analysisHover.current = {
			type: 'ask',
			clusterId,
			position,
			visible: true
		};
		startHoverTimeout();

		// Demo Auto-Interaction
		if (demoCursor.visible) {
			queueAction(async () => {
				const btnId = `hover-ask-yes-${clusterId}`;
				const found = await waitForTarget(btnId, 2000);
				if (found && demoCursor.visible) {
					await moveCursorToElement(btnId, {
						action: 'click',
						duration: 800,
						onComplete: () => handleAskResponse('yes')
					});
				}
			});
		}
	});
}

export function showResultHover(
	clusterId: string,
	analysisItemId: string,
	bounds: BoundingBox,
	title: string,
	content: string
) {
	const position = getHoverPosition(bounds);
	analysisHover.current = {
		type: 'result',
		clusterId,
		analysisItemId,
		position,
		title,
		content,
		visible: true
	};
	startHoverTimeout();

	// Demo Auto-Interaction
	if (demoCursor.visible) {
		queueAction(async () => {
			const btnId = `hover-feedback-yes-${clusterId}`;
			const found = await waitForTarget(btnId, 8000); // Wait longer for API
			if (found && demoCursor.visible) {
				await moveCursorToElement(btnId, {
					action: 'click',
					duration: 800,
					onComplete: () => handleResultFeedback('yes')
				});
			}
		});
	}
}

export function dismissHover(result: 'yes' | 'no' | 'dismissed' = 'dismissed') {
	if (hoverTimeoutId) {
		clearTimeout(hoverTimeoutId);
		hoverTimeoutId = null;
	}
	if (analysisHover.askResolve) {
		analysisHover.askResolve(result);
		analysisHover.askResolve = null;
	}
	if (analysisHover.current) {
		analysisHover.current = { ...analysisHover.current, visible: false };
		setTimeout(() => {
			analysisHover.current = null;
		}, 300);
	}
}

export function handleAskResponse(response: 'yes' | 'no') {
	const elementId = analysisHover.current
		? `hover-ask-${response}-${analysisHover.current.clusterId}`
		: undefined;
	moveCursorToElement(elementId, {
		onComplete: () => {
			dismissHover(response);
		}
	});
}

export function handleResultFeedback(feedback: 'yes' | 'no') {
	const elementId = analysisHover.current
		? `hover-feedback-${feedback}-${analysisHover.current.clusterId}`
		: undefined;
	if (analysisHover.current?.analysisItemId) {
		setAnalysisItemFeedback(analysisHover.current.analysisItemId, feedback, undefined, elementId, {
			onComplete: () => {
				dismissHover('dismissed');
			}
		});
	}
}

// --- Analysis Results State ---

export const analysisResults = $state({
	items: [] as Array<{
		id: string;
		title: string;
		content: string;
		expanded: boolean;
		userModified?: boolean;
		userInteracted?: boolean;
		feedback?: 'yes' | 'no' | 'other' | null;
		feedbackText?: string;
		objectId?: string;
		timestamp: number;
		imageUrl?: string;
		bounds?: { minX: number; minY: number; maxX: number; maxY: number };
	}>,
	isProcessing: false,
	highlightedItemId: null as string | null,
	hoveredItemId: null as string | null,
	maxItems: 100
});

const timeoutIds = new Set<ReturnType<typeof setTimeout>>();

export function addUserNote(content: string, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		...options,
		onComplete: () => {
			addAnalysisItem('User Note', content, true);
			options?.onComplete?.();
		}
	});
}

export function addAnalysisItem(
	title: string,
	content: string,
	userModified = false,
	id: string = `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
	objectId?: string,
	imageUrl?: string,
	bounds?: { minX: number; minY: number; maxX: number; maxY: number }
) {
	analysisResults.items.push({
		id,
		title,
		content,
		expanded: true,
		userModified,
		userInteracted: userModified,
		feedback: null,
		feedbackText: '',
		objectId,
		timestamp: Date.now(),
		imageUrl,
		bounds
	});

	const collapseCallback = () => {
		timeoutIds.delete(collapseTimeout);

		// Only collapse previous item if:
		// 1. There are at least 2 items
		// 2. Current item is NOT user-modified (auto-analysis)
		// 3. Previous item is NOT user-interacted
		// 4. Previous item is NOT user-modified (don't collapse user notes)
		if (analysisResults.items.length > 1 && !userModified) {
			const lastItem = analysisResults.items[analysisResults.items.length - 2];
			if (lastItem && !lastItem.userInteracted && !lastItem.userModified) {
				lastItem.expanded = false;
			}
		}
	};
	const collapseTimeout = setTimeout(collapseCallback, 300);
	timeoutIds.add(collapseTimeout);

	analysisResults.highlightedItemId = id;
	const highlightTimeout = setTimeout(() => {
		timeoutIds.delete(highlightTimeout);
		analysisResults.highlightedItemId = null;
	}, 1500);
	timeoutIds.add(highlightTimeout);

	if (analysisResults.items.length > analysisResults.maxItems) {
		analysisResults.items = analysisResults.items.slice(-analysisResults.maxItems);
	}

	return id;
}

export function deleteAnalysisItem(id: string) {
	analysisResults.items = analysisResults.items.filter((item) => item.id !== id);
}

export function toggleAnalysisItem(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.expanded = !item.expanded;
		item.userInteracted = true;
	}
}

export function markAnalysisItemInteracted(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.userInteracted = true;
	}
}

export function clearAnalysisResults() {
	analysisResults.items = [];
	analysisResults.isProcessing = false;
	analysisResults.highlightedItemId = null;
	analysisResults.hoveredItemId = null;
}

export function getHoveredObjectId(): string | null {
	if (!analysisResults.hoveredItemId) return null;
	const item = analysisResults.items.find((i) => i.id === analysisResults.hoveredItemId);
	return item?.objectId || null;
}

export function updateAnalysisItem(
	id: string,
	title: string,
	content: string,
	objectId?: string,
	imageUrl?: string,
	bounds?: { minX: number; minY: number; maxX: number; maxY: number }
) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.title = title;
		item.content = content;
		item.userModified = true;
		item.expanded = true;
		if (objectId) item.objectId = objectId;
		item.timestamp = Date.now();
		if (objectId) item.objectId = objectId;
		if (imageUrl) item.imageUrl = imageUrl;
		if (bounds) item.bounds = bounds;

		analysisResults.highlightedItemId = id;
		const highlightTimeout = setTimeout(() => {
			timeoutIds.delete(highlightTimeout);
			analysisResults.highlightedItemId = null;
		}, 1500);
		timeoutIds.add(highlightTimeout);
	}
}

export function cleanupAnalysisTimers() {
	timeoutIds.forEach((id) => clearTimeout(id));
	timeoutIds.clear();
}

export function setAnalysisItemFeedback(
	id: string,
	feedback: 'yes' | 'no' | 'other',
	feedbackText?: string,
	elementId?: string,
	options?: CursorOptions
) {
	moveCursorToElement(elementId, {
		...options,
		onComplete: () => {
			const item = analysisResults.items.find((i) => i.id === id);
			if (item) {
				item.feedback = feedback;
				item.feedbackText = feedbackText;
				item.userInteracted = true;
			}
			options?.onComplete?.();
		}
	});
}
