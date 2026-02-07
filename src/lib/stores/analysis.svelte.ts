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

// History entry for analysis item
interface AnalysisHistoryEntry {
	title: string;
	content: string;
	imageUrl?: string;
	contextImageUrl?: string;
	timestamp: number;
}

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
		imageUrl?: string; // Intent image (bright/dim)
		contextImageUrl?: string; // Context image (with colored outlines)
		bounds?: { minX: number; minY: number; maxX: number; maxY: number };
		// Loading state
		status: 'loading' | 'success' | 'error';
		errorMessage?: string;
		clusterId?: string; // For retry functionality
		// History navigation
		history: AnalysisHistoryEntry[];
		historyIndex: number; // -1 means current (latest), 0+ means viewing history
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
	bounds?: { minX: number; minY: number; maxX: number; maxY: number },
	status: 'loading' | 'success' | 'error' = 'success',
	clusterId?: string
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
		bounds,
		status,
		clusterId,
		history: [],
		historyIndex: -1
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

// Add a loading placeholder item
export function addLoadingItem(
	clusterId: string,
	bounds?: { minX: number; minY: number; maxX: number; maxY: number }
): string {
	const id = `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	analysisResults.items.push({
		id,
		title: 'Analyzing...',
		content: '',
		expanded: true,
		userModified: false,
		userInteracted: false,
		feedback: null,
		feedbackText: '',
		objectId: undefined,
		timestamp: Date.now(),
		imageUrl: undefined,
		bounds,
		status: 'loading',
		clusterId,
		history: [],
		historyIndex: -1
	});
	return id;
}

// Set item to error state with retry option
export function setItemError(id: string, errorMessage: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.status = 'error';
		item.errorMessage = errorMessage;
		item.title = 'Analysis Failed';
		item.content = errorMessage;
	}
}

// Set item to success with analysis result
export function setItemSuccess(
	id: string,
	title: string,
	content: string,
	objectId?: string,
	imageUrl?: string,
	bounds?: { minX: number; minY: number; maxX: number; maxY: number },
	contextImageUrl?: string
) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		// Push current state to history before updating (if not loading)
		if (item.status === 'success' && item.title) {
			item.history.push({
				title: item.title,
				content: item.content,
				imageUrl: item.imageUrl,
				contextImageUrl: item.contextImageUrl,
				timestamp: item.timestamp
			});
		}
		// Reset to viewing latest
		item.historyIndex = -1;
		// Update current state
		item.status = 'success';
		item.title = title;
		item.content = content;
		item.errorMessage = undefined;
		if (objectId) item.objectId = objectId;
		if (imageUrl) item.imageUrl = imageUrl;
		if (contextImageUrl) item.contextImageUrl = contextImageUrl;
		if (bounds) item.bounds = bounds;
		item.timestamp = Date.now();
	}
}

// Navigate to previous history entry
export function navigateHistoryPrev(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (!item || item.history.length === 0) return;

	// If currently at latest (-1), go to last history entry
	if (item.historyIndex === -1) {
		item.historyIndex = item.history.length - 1;
	} else if (item.historyIndex > 0) {
		item.historyIndex--;
	}
}

// Navigate to next history entry (or back to current)
export function navigateHistoryNext(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (!item) return;

	// If at or past last history entry, go back to current (-1)
	if (item.historyIndex >= item.history.length - 1 || item.historyIndex === -1) {
		item.historyIndex = -1;
	} else {
		item.historyIndex++;
	}
}

// Get the currently displayed state for an item (respects history navigation)
export function getDisplayedItem(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (!item) return null;

	// If viewing history
	if (item.historyIndex >= 0 && item.historyIndex < item.history.length) {
		const historyEntry = item.history[item.historyIndex];
		return {
			title: historyEntry.title,
			content: historyEntry.content,
			imageUrl: historyEntry.imageUrl,
			contextImageUrl: historyEntry.contextImageUrl,
			timestamp: historyEntry.timestamp,
			isHistorical: true,
			currentIndex: item.historyIndex,
			totalVersions: item.history.length + 1 // +1 for current
		};
	}

	// Viewing current
	return {
		title: item.title,
		content: item.content,
		imageUrl: item.imageUrl,
		contextImageUrl: item.contextImageUrl,
		timestamp: item.timestamp,
		isHistorical: false,
		currentIndex: item.history.length, // Current is "last"
		totalVersions: item.history.length + 1
	};
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

// Feedback event for AutoAnalysis to handle
export type FeedbackEvent = {
	itemId: string;
	objectId?: string;
	feedback: 'yes' | 'no' | 'other';
	text?: string;
};

// Callback for handling feedback events (registered by AutoAnalysis)
let feedbackCallback: ((event: FeedbackEvent) => void) | null = null;

export function registerFeedbackHandler(callback: (event: FeedbackEvent) => void) {
	feedbackCallback = callback;
}

export function unregisterFeedbackHandler() {
	feedbackCallback = null;
}

// Retry callback for failed analysis items
let retryCallback: ((itemId: string, clusterId: string) => void) | null = null;

export function registerRetryHandler(callback: (itemId: string, clusterId: string) => void) {
	retryCallback = callback;
}

export function unregisterRetryHandler() {
	retryCallback = null;
}

export function requestItemRetry(itemId: string) {
	const item = analysisResults.items.find((i) => i.id === itemId);
	if (item && item.clusterId && retryCallback) {
		// Set back to loading state
		item.status = 'loading';
		item.title = 'Retrying...';
		item.content = '';
		item.errorMessage = undefined;
		retryCallback(itemId, item.clusterId);
	}
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
				// Collapse item after feedback
				item.expanded = false;

				// Notify AutoAnalysis to handle the feedback (revert groups, retry, etc.)
				if (feedbackCallback) {
					feedbackCallback({
						itemId: id,
						objectId: item.objectId,
						feedback,
						text: feedbackText
					});
				}
			}
			options?.onComplete?.();
		}
	});
}
