import {
	moveCursorToElement,
	demoCursor,
	queueAction,
	waitForTarget,
	type CursorOptions
} from './demoCursor.svelte';
import { canvasToScreen } from '$lib/utils/demoStroke';
import { traceImage } from '$lib/utils/tracer';
import { addStroke, calculateBoundingBox, requestRender, strokes } from '$lib/stores/canvas.svelte';
import type { BoundingBox, Stroke } from '$lib/types';
import { trackedClusters } from '$lib/stores/autoAnalysis.svelte';
import { COLORS } from '$lib/utils/constants';
import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';

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

export const analysisHover = $state<{
	current: CanvasHover | null;
	askResolve: ((result: 'yes' | 'no' | 'dismissed') => void) | null;
}>({
	current: null,
	askResolve: null
});

// --- Manual Analysis Trigger (for demo mode) ---

let manualTriggerCallback: (() => void) | null = null;

// ... (existing code: registerAnalysisTrigger, unregisterAnalysisTrigger, triggerAnalysisNow) ...
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
	console.warn('[Analysis] No trigger callback registered');
	return false;
}

// --- Manual Selection Analysis Trigger ---

let manualSelectionHandler: ((ids: Set<string>) => void) | null = null;

export function registerManualSelectionHandler(callback: (ids: Set<string>) => void) {
	manualSelectionHandler = callback;
}

export function unregisterManualSelectionHandler() {
	manualSelectionHandler = null;
}

export function triggerManualSelectionAnalysis(ids: Set<string>) {
	if (manualSelectionHandler) {
		manualSelectionHandler(ids);
		return true;
	}
	console.warn('[Analysis] No manual selection handler registered');
	return false;
}

// --- Hover Timeout Management ---

const HOVER_TIMEOUT = 5000;
let hoverTimeoutId: ReturnType<typeof setTimeout> | null = null;
// ... (existing timeout functions) ...
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
	// ... (existing getHoverPosition) ...
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

// ... (showAskHover same as before) ...
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
	// ... (existing demo logic) ...
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

// UPDATE: Modify handleResultFeedback to show "Recreate" instead of dismissing if 'yes'
export function handleResultFeedback(feedback: 'yes' | 'no') {
	const elementId = analysisHover.current
		? `hover-feedback-${feedback}-${analysisHover.current.clusterId}`
		: undefined;

	// Capture values before async/callbacks
	const currentHover = analysisHover.current;

	if (currentHover?.analysisItemId) {
		setAnalysisItemFeedback(currentHover.analysisItemId, feedback, undefined, elementId, {
			onComplete: () => {
				dismissHover('dismissed');
			}
		});
	}
}

// NEW: Handle Recreate Action
// NEW: Handle Recreate Action as New Item
export async function handleRecreate(sourceItemId: string) {
	const sourceItem = analysisResults.items.find((i) => i.id === sourceItemId);
	if (!sourceItem || !sourceItem.imageUrl) {
		console.error('[Analysis] No source item or image for recreation');
		return;
	}

	console.log('[Analysis] Requesting recreation for item:', sourceItemId);

	// Create a new item to track progress
	const newItemId = addAnalysisItem(
		`Recreating ${sourceItem.title}...`,
		'Generating new version based on original sketch.',
		false,
		undefined,
		sourceItem.objectId,
		sourceItem.imageUrl, // Show original image initially
		sourceItem.bounds,
		'loading',
		sourceItem.clusterId
	);

	// Reverse lookup helper
	const getColorName = (hex: string) => {
		const entry = Object.entries(COLORS).find(([, h]) => h.toLowerCase() === hex.toLowerCase());
		return entry ? `${entry[0]} (${hex})` : hex;
	};

	// Extract stroke properties from tracked cluster or canvas state
	let strokeContext = '';

	// Get background color from current state
	const bgHex = canvasToolbarState.backgroundColor;
	const bgName = getColorName(bgHex);

	// Get strokes
	let usedStrokes: Stroke[] = [];
	if (sourceItem.clusterId) {
		const cluster = trackedClusters.get(sourceItem.clusterId);
		if (cluster && cluster.strokeIds) {
			usedStrokes = Array.from(cluster.strokeIds)
				.map((id) => strokes.get(id))
				.filter((s) => s !== undefined) as Stroke[];
		}
	}

	if (usedStrokes.length > 0) {
		// Collect unique colors and sizes
		const colorSet = new Set<string>();
		const sizeSet = new Set<number>();

		usedStrokes.forEach((s) => {
			colorSet.add(getColorName(s.color));
			sizeSet.add(s.size);
		});

		strokeContext = `
		Stroke Colors: ${Array.from(colorSet).join(', ')}.
		Stroke Sizes: ${Array.from(sizeSet)
			.map((s) => s + 'px')
			.join(', ')}.
		Background Color: ${bgName}.
		`;
	} else {
		// Fallback if no specific strokes found (e.g. just using image)
		strokeContext = `Background Color: ${bgName}.`;
	}

	const contextString = `The user has identified this as: ${sourceItem.title}. ${sourceItem.content}.
				${strokeContext}
				User Intent: Autocorrect this sketch to look professional but keep exact colors and stroke style.`;

	console.log('[Analysis] Generated Prompt Context:', contextString);

	try {
		// 1. Call API
		const response = await fetch('/api/generate-image', {
			method: 'POST',
			body: JSON.stringify({
				image: sourceItem.imageUrl,
				context: contextString
			}),
			headers: { 'Content-Type': 'application/json' }
		});

		if (!response.ok) throw new Error('Generation failed');
		const data = await response.json();

		if (!data.success || !data.image) {
			throw new Error(data.error || 'No image returned');
		}

		console.log('[Analysis] Image generated, tracing...');

		// 2. Trace Image
		const strokes = await traceImage(data.image, usedStrokes, {
			threshold: 128,
			smoothing: 0.5
		});

		console.log(`[Analysis] Traced ${strokes.length} strokes.`);

		// 3. Add to canvas
		if (sourceItem.bounds) {
			const tracedBounds = calculateBoundingBox(strokes);
			if (tracedBounds) {
				const originalW = sourceItem.bounds.width;
				const originalH = sourceItem.bounds.height;
				const tracedW = tracedBounds.width;
				const tracedH = tracedBounds.height;

				const scaleX = originalW / tracedW;
				const scaleY = originalH / tracedH;
				const scale = Math.min(scaleX, scaleY) * 0.9;

				const offsetX = sourceItem.bounds.centerX - tracedBounds.centerX * scale;
				const offsetY = sourceItem.bounds.centerY - tracedBounds.centerY * scale;

				strokes.forEach((s) => {
					s.points.forEach((p) => {
						p.x = p.x * scale + offsetX;
						p.y = p.y * scale + offsetY;
					});
					s.bounding = calculateBoundingBox([s]) ?? undefined;
					addStroke(s);
				});
				requestRender();
			}
		} else {
			strokes.forEach((s) => addStroke(s));
			requestRender();
		}

		// Generate SVG for display
		const svgStrokes = strokes.reduce((acc, s) => {
			const points = s.points.map((p) => `${p.x},${p.y}`).join(' ');
			return (
				acc +
				`<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" />`
			);
		}, '');

		// If we scaled/positioned strokes, we need accurate bounds for the SVG viewBox
		// For simplicity, we can use the canvas size or the bounding box of the strokes
		// Using canvas size ensures alignment if we just dump it
		// But ideally we want a tight crop.
		// Let's use the layout bounds logic
		let svgViewBox = '0 0 100 100'; // Default
		if (strokes.length > 0) {
			const b = calculateBoundingBox(strokes);
			if (b) {
				svgViewBox = `${b.minX - 10} ${b.minY - 10} ${b.width + 20} ${b.height + 20}`;
			}
		}

		const generatedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svgViewBox}">${svgStrokes}</svg>`;

		// Update new item with success
		setItemSuccess(
			newItemId,
			`Recreated ${sourceItem.title}`,
			'Successfully recreated using AI generation.',
			sourceItem.objectId,
			sourceItem.imageUrl,
			sourceItem.bounds, // Use original bounds as reference
			undefined,
			data.image, // Generated image
			generatedSvg // Trace SVG
		);
	} catch (e) {
		console.error('[Analysis] Recreation failed:', e);
		setItemError(
			newItemId,
			`Recreation failed: ${e instanceof Error ? e.message : 'Unknown error'}`
		);
	}
}

export async function handleRetrace(itemId: string) {
	const item = analysisResults.items.find((i) => i.id === itemId);
	if (!item || !item.generatedImageUrl) {
		console.error('[Analysis] No item or generated image to retrace');
		return;
	}

	console.log('[Analysis] Retracing item:', itemId);

	// Try to find original strokes to get color
	let traceColor = canvasToolbarState.brushColor;
	let originalStrokes: Stroke[] = [];

	if (item.clusterId) {
		const cluster = trackedClusters.get(item.clusterId);
		if (cluster && cluster.strokeIds && cluster.strokeIds.size > 0) {
			const firstStrokeId = Array.from(cluster.strokeIds)[0];
			const stroke = strokes.get(firstStrokeId);
			if (stroke) {
				traceColor = stroke.color;
			}
			originalStrokes = Array.from(cluster.strokeIds)
				.map((id) => strokes.get(id))
				.filter((s): s is Stroke => s !== undefined);
		}
	}

	try {
		const resultStrokes = await traceImage(item.generatedImageUrl, originalStrokes, {
			threshold: 128,
			smoothing: 0.5,
			color: traceColor
		});

		console.log(`[Analysis] Retraced ${resultStrokes.length} strokes.`);

		// Generate SVG for display
		const svgStrokes = resultStrokes.reduce((acc, s) => {
			const points = s.points.map((p) => `${p.x},${p.y}`).join(' ');
			return (
				acc +
				`<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" />`
			);
		}, '');

		let svgViewBox = '0 0 100 100';
		if (resultStrokes.length > 0) {
			const b = calculateBoundingBox(resultStrokes);
			if (b) {
				svgViewBox = `${b.minX - 10} ${b.minY - 10} ${b.width + 20} ${b.height + 20}`;
			}
		}

		const generatedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svgViewBox}">${svgStrokes}</svg>`;

		// Update item with new SVG
		item.generatedSvg = generatedSvg;

		// Update history entry if viewing one
		if (item.historyIndex >= 0 && item.historyIndex < item.history.length) {
			item.history[item.historyIndex].generatedSvg = generatedSvg;
		}

		// --- UPDATE STATE: Replace Hand-Drawn with Vector ---
		if (item.clusterId && resultStrokes.length > 0) {
			const cluster = trackedClusters.get(item.clusterId);
			if (cluster) {
				// 1. Remove old strokes
				const oldStrokeIds = Array.from(cluster.strokeIds);
				oldStrokeIds.forEach((id) => {
					strokes.delete(id);
				});

				// 2. Add new strokes
				const newStrokeIds = new Set<string>();

				// Calculate transform to match source bounds
				const tracedBounds = calculateBoundingBox(resultStrokes);
				if (item.bounds && tracedBounds) {
					const targetW = item.bounds.width;
					const targetH = item.bounds.height;
					const currentW = tracedBounds.width;
					const currentH = tracedBounds.height;

					// Avoid division by zero
					const scaleX = currentW > 0 ? targetW / currentW : 1;
					const scaleY = currentH > 0 ? targetH / currentH : 1;

					const targetX = item.bounds.minX;
					const targetY = item.bounds.minY;
					const currentX = tracedBounds.minX;
					const currentY = tracedBounds.minY;

					resultStrokes.forEach((s) => {
						s.filled = true; // Apply fill workaround
						s.points.forEach((p) => {
							// Localize, Scale, Translate
							p.x = (p.x - currentX) * scaleX + targetX;
							p.y = (p.y - currentY) * scaleY + targetY;
						});
						// Update cached bounds for individual stroke
						s.bounding = calculateBoundingBox([s]) ?? undefined;

						addStroke(s);
						newStrokeIds.add(s.id);
					});
				} else {
					// Fallback if no bounds info
					resultStrokes.forEach((s) => {
						s.filled = true;
						addStroke(s);
						newStrokeIds.add(s.id);
					});
				}

				// 3. Update Cluster Tracker
				cluster.strokeIds = newStrokeIds;
				// Recalculate bounds of the transformed strokes (should match target exactly now)
				const finalBounds = calculateBoundingBox(resultStrokes);
				if (finalBounds) {
					cluster.bounds = finalBounds;
					item.bounds = finalBounds;
				}
				cluster.lastUpdate = Date.now();

				// 4. Force Render
				requestRender();

				console.log(
					`[Analysis] Swapped ${oldStrokeIds.length} hand-drawn strokes for ${resultStrokes.length} filled vector strokes (aligned to source).`
				);
			}
		}
	} catch (e) {
		console.error('[Analysis] Retrace failed:', e);
	}
}

// --- Analysis Results State ---

// ... (existing AnalysisHistoryEntry interface and analysisResults state) ...
export interface AnalysisHistoryEntry {
	title: string;
	content: string;
	imageUrl?: string;
	contextImageUrl?: string;
	generatedImageUrl?: string;
	generatedSvg?: string;
	timestamp: number;
}

export interface AnalysisItem {
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
	generatedImageUrl?: string; // AI generated image
	generatedSvg?: string; // Traced SVG
	bounds?: BoundingBox;
	status: 'loading' | 'success' | 'error';
	errorMessage?: string;
	clusterId?: string;
	history: AnalysisHistoryEntry[];
	historyIndex: number;
}

export const analysisResults = $state({
	items: [] as AnalysisItem[],
	isProcessing: false,
	highlightedItemId: null as string | null,
	hoveredItemId: null as string | null,
	maxItems: 100
});

// Update BoundingBox type to match canvas.ts return
// export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };
// -> BECOMES:
// export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; centerX: number; centerY: number };
// BUT, to avoid breaking other files relying on simple Min/Max, I'll extend it or just rely on the object shape at runtime.
// Ideally I should update the type definition.

// Since I am overwriting the file, I should make sure I include ALL unrelated functions too or imports.
// I will attempt to surgically replace or rewrite the whole file carefully.
// I have the full file content from Step 9.

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

// ... (rest of the file content from Step 9: addAnalysisItem, addLoadingItem, setItemError, setItemSuccess, navigation, etc) ...

export function addAnalysisItem(
	title: string,
	content: string,
	userModified = false,
	id: string = `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
	objectId?: string,
	imageUrl?: string,
	bounds?: BoundingBox,
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
	// ... collapse/highlight logic ...
	const collapseCallback = () => {
		timeoutIds.delete(collapseTimeout);
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

export function addLoadingItem(clusterId: string, bounds?: BoundingBox): string {
	// ...
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

export function setItemError(id: string, errorMessage: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.status = 'error';
		item.errorMessage = errorMessage;
		item.title = 'Analysis Failed';
		item.content = errorMessage;
	}
}

export function setItemSuccess(
	id: string,
	title: string,
	content: string,
	objectId?: string,
	imageUrl?: string,
	bounds?: BoundingBox,
	contextImageUrl?: string,
	generatedImageUrl?: string,
	generatedSvg?: string
) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		if (item.status === 'success' && item.title) {
			item.history.push({
				title: item.title,
				content: item.content,
				imageUrl: item.imageUrl,
				contextImageUrl: item.contextImageUrl,
				generatedImageUrl: item.generatedImageUrl,
				generatedSvg: item.generatedSvg,
				timestamp: item.timestamp
			});
		}
		item.historyIndex = -1;
		item.status = 'success';
		item.title = title;
		item.content = content;
		item.errorMessage = undefined;
		if (objectId) item.objectId = objectId;
		if (imageUrl) item.imageUrl = imageUrl;
		if (contextImageUrl) item.contextImageUrl = contextImageUrl;
		if (generatedImageUrl) item.generatedImageUrl = generatedImageUrl;
		if (generatedSvg) item.generatedSvg = generatedSvg;
		if (bounds) item.bounds = bounds;
		item.timestamp = Date.now();
	}
}

export function navigateHistoryPrev(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (!item || item.history.length === 0) return;
	if (item.historyIndex === -1) {
		item.historyIndex = item.history.length - 1;
	} else if (item.historyIndex > 0) {
		item.historyIndex--;
	}
}

export function navigateHistoryNext(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (!item) return;
	if (item.historyIndex >= item.history.length - 1 || item.historyIndex === -1) {
		item.historyIndex = -1;
	} else {
		item.historyIndex++;
	}
}

export function getDisplayedItem(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (!item) return null;
	if (item.historyIndex >= 0 && item.historyIndex < item.history.length) {
		const historyEntry = item.history[item.historyIndex];
		return {
			title: historyEntry.title,
			content: historyEntry.content,
			imageUrl: historyEntry.imageUrl,
			contextImageUrl: historyEntry.contextImageUrl,
			generatedImageUrl: historyEntry.generatedImageUrl,
			generatedSvg: historyEntry.generatedSvg,
			timestamp: historyEntry.timestamp,
			isHistorical: true,
			currentIndex: item.historyIndex,
			totalVersions: item.history.length + 1
		};
	}
	return {
		title: item.title,
		content: item.content,
		imageUrl: item.imageUrl,
		contextImageUrl: item.contextImageUrl,
		generatedImageUrl: item.generatedImageUrl,
		generatedSvg: item.generatedSvg,
		timestamp: item.timestamp,
		isHistorical: false,
		currentIndex: item.history.length,
		totalVersions: item.history.length + 1
	};
}

export function deleteAnalysisItem(id: string) {
	analysisResults.items = analysisResults.items.filter((item) => item.id !== id);

	// Also clear from tracked clusters
	for (const tracker of trackedClusters.values()) {
		if (tracker.analysisItemId === id) {
			tracker.analysisItemId = null;
			break; // Found it
		}
	}
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

	for (const tracker of trackedClusters.values()) {
		tracker.analysisItemId = null;
	}
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
	bounds?: BoundingBox
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

export type FeedbackEvent = {
	itemId: string;
	objectId?: string;
	feedback: 'yes' | 'no' | 'other';
	text?: string;
};

let feedbackCallback: ((event: FeedbackEvent) => void) | null = null;

export function registerFeedbackHandler(callback: (event: FeedbackEvent) => void) {
	feedbackCallback = callback;
}

export function unregisterFeedbackHandler() {
	feedbackCallback = null;
}

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
