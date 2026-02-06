import type { DemoScenario } from '$lib/demo/types';
import { runAction } from '$lib/demo/registry';
import {
	showCursor,
	hideCursor,
	demoCursor,
	moveCursorToElement,
	cancelAllAnimations,
	clearActionQueue,
	type CursorOptions
} from './demoCursor.svelte';
import { canvasToolbarState } from './canvasToolbar.svelte';
import {
	strokes,
	strokeGroupMap,
	groups,
	groupState,
	requestRender,
	recomputeGroups
} from './canvas.svelte';
import { clearHistory } from './history.svelte';
import { analysisResults, analysisHover, pauseHoverTimeout } from './analysis.svelte';
import { resetAutoAnalysisState } from './autoAnalysis.svelte';
import { Layer, type Stroke } from '$lib/types';
import { BRUSH_SIZES, COLORS } from '$lib/utils/constants';

// --- Runner State (Reactive) ---

type DemoRunnerState = {
	isRunning: boolean;
	isPaused: boolean;
	currentScenario: DemoScenario | null;
	currentIndex: number;
};

export const demoRunnerState: DemoRunnerState = $state({
	isRunning: false,
	isPaused: false,
	currentScenario: null,
	currentIndex: 0
});

// Internal
let pauseResolve: (() => void) | null = null;

// --- State Snapshot for Restore ---

type StateSnapshot = {
	// Strokes
	strokes: Map<string, Stroke>;
	// Toolbar state
	canvasToolbar: {
		activeLayer: Layer;
		selectedIds: string[];
		mode: 'brush' | 'select';
		groupSelect: boolean;
		brushSize: number;
		brushColor: string;
		backgroundColor: string;
		hoveredStrokeId: string | null;
		highlightedStrokeIds: Set<string>;
		isDrawing: boolean;
	};
	// Analysis results
	analysisItems: typeof analysisResults.items;
	analysisIsProcessing: boolean;
	analysisHighlightedItemId: string | null;
	analysisHoveredItemId: string | null;
	// Cursor state
	cursorVisible: boolean;
	cursorX: number;
	cursorY: number;
	cursorClicking: boolean;
	cursorDragging: boolean;
};

let savedSnapshot: StateSnapshot | null = null;

/**
 * Save a snapshot of all application state before demo starts.
 */
function saveStateSnapshot(): void {
	// Deep clone strokes
	const strokesClone = new Map<string, Stroke>();
	for (const [id, stroke] of strokes) {
		strokesClone.set(id, {
			...stroke,
			points: stroke.points.map((p) => ({ ...p })),
			transform: stroke.transform ? { ...stroke.transform } : undefined,
			bounding: stroke.bounding ? { ...stroke.bounding } : undefined,
			corners: stroke.corners ? [...stroke.corners] : undefined
		});
	}

	savedSnapshot = {
		strokes: strokesClone,
		canvasToolbar: {
			activeLayer: canvasToolbarState.activeLayer,
			selectedIds: [...canvasToolbarState.selectedIds],
			mode: canvasToolbarState.mode,
			groupSelect: canvasToolbarState.groupSelect,
			brushSize: canvasToolbarState.brushSize,
			brushColor: canvasToolbarState.brushColor,
			backgroundColor: canvasToolbarState.backgroundColor,
			hoveredStrokeId: canvasToolbarState.hoveredStrokeId,
			highlightedStrokeIds: new Set(canvasToolbarState.highlightedStrokeIds),
			isDrawing: canvasToolbarState.isDrawing
		},
		analysisItems: analysisResults.items.map((item) => ({ ...item })),
		analysisIsProcessing: analysisResults.isProcessing,
		analysisHighlightedItemId: analysisResults.highlightedItemId,
		analysisHoveredItemId: analysisResults.hoveredItemId,
		cursorVisible: demoCursor.visible,
		cursorX: demoCursor.x,
		cursorY: demoCursor.y,
		cursorClicking: demoCursor.clicking,
		cursorDragging: demoCursor.dragging
	};

	console.log('[DemoRunner] State snapshot saved');
}

/**
 * Reset all state to fresh defaults for demo.
 */
function resetToDefaults(): void {
	// Clear strokes
	strokes.clear();
	strokeGroupMap.clear();
	groups.clear();
	groupState.version++;

	// Reset toolbar to defaults (from canvasToolbar.svelte.ts)
	canvasToolbarState.activeLayer = Layer.START;
	canvasToolbarState.selectedIds = [];
	canvasToolbarState.mode = 'brush';
	canvasToolbarState.groupSelect = true;
	canvasToolbarState.brushSize = BRUSH_SIZES[1]; // Default: 5
	canvasToolbarState.brushColor = COLORS.white;
	canvasToolbarState.backgroundColor = COLORS.black;
	canvasToolbarState.hoveredStrokeId = null;
	canvasToolbarState.highlightedStrokeIds = new Set();
	canvasToolbarState.isDrawing = false;

	// Clear history
	clearHistory();

	// Clear analysis results
	analysisResults.items = [];
	analysisResults.isProcessing = false;
	analysisResults.highlightedItemId = null;
	analysisResults.hoveredItemId = null;

	// Dismiss any active hover
	if (analysisHover.current) {
		analysisHover.current = null;
		analysisHover.askResolve = null;
	}
	pauseHoverTimeout();

	// Reset AutoAnalysis internal state (trackedClusters, queue, etc.)
	resetAutoAnalysisState();

	requestRender();
	console.log('[DemoRunner] State reset to defaults');
}

/**
 * Force cleanup of all running demo operations.
 * Call this when stopping demo mid-animation.
 */
function forceCleanup(): void {
	// Cancel cursor animations
	cancelAllAnimations();
	// Clear action queue
	clearActionQueue();
	// Clear any pending hover timeout
	pauseHoverTimeout();
	// Dismiss hover immediately
	if (analysisHover.current) {
		analysisHover.current = null;
		analysisHover.askResolve = null;
	}
	// Reset AutoAnalysis internal state (trackedClusters, queue, etc.)
	resetAutoAnalysisState();
	// Reset cursor state
	demoCursor.clicking = false;
	demoCursor.dragging = false;
	demoCursor.visible = false;

	console.log('[DemoRunner] Force cleanup completed');
}

/**
 * Restore state from saved snapshot after demo ends.
 */
function restoreStateSnapshot(): void {
	if (!savedSnapshot) {
		console.warn('[DemoRunner] No snapshot to restore');
		return;
	}

	// First force cleanup any running operations
	forceCleanup();

	// Restore strokes
	strokes.clear();
	for (const [id, stroke] of savedSnapshot.strokes) {
		strokes.set(id, {
			...stroke,
			points: stroke.points.map((p) => ({ ...p })),
			transform: stroke.transform ? { ...stroke.transform } : undefined,
			bounding: stroke.bounding ? { ...stroke.bounding } : undefined,
			corners: stroke.corners ? [...stroke.corners] : undefined
		});
	}

	// Restore toolbar state
	canvasToolbarState.activeLayer = savedSnapshot.canvasToolbar.activeLayer;
	canvasToolbarState.selectedIds = [...savedSnapshot.canvasToolbar.selectedIds];
	canvasToolbarState.mode = savedSnapshot.canvasToolbar.mode;
	canvasToolbarState.groupSelect = savedSnapshot.canvasToolbar.groupSelect;
	canvasToolbarState.brushSize = savedSnapshot.canvasToolbar.brushSize;
	canvasToolbarState.brushColor = savedSnapshot.canvasToolbar.brushColor;
	canvasToolbarState.backgroundColor = savedSnapshot.canvasToolbar.backgroundColor;
	canvasToolbarState.hoveredStrokeId = savedSnapshot.canvasToolbar.hoveredStrokeId;
	canvasToolbarState.highlightedStrokeIds = new Set(
		savedSnapshot.canvasToolbar.highlightedStrokeIds
	);
	canvasToolbarState.isDrawing = savedSnapshot.canvasToolbar.isDrawing;

	// Restore analysis results
	analysisResults.items = savedSnapshot.analysisItems.map((item) => ({ ...item }));
	analysisResults.isProcessing = savedSnapshot.analysisIsProcessing;
	analysisResults.highlightedItemId = savedSnapshot.analysisHighlightedItemId;
	analysisResults.hoveredItemId = savedSnapshot.analysisHoveredItemId;

	// Restore cursor state
	demoCursor.visible = savedSnapshot.cursorVisible;
	demoCursor.x = savedSnapshot.cursorX;
	demoCursor.y = savedSnapshot.cursorY;
	demoCursor.clicking = savedSnapshot.cursorClicking;
	demoCursor.dragging = savedSnapshot.cursorDragging;

	// Recompute groups
	recomputeGroups();
	requestRender();

	savedSnapshot = null;
	console.log('[DemoRunner] State restored from snapshot');
}

// --- Public API ---

/**
 * Run a demo scenario.
 */
export async function runScenario(
	scenario: DemoScenario,
	options: { showCursorOnStart?: boolean; hideCursorOnEnd?: boolean } = {}
): Promise<void> {
	if (demoRunnerState.isRunning) {
		console.warn('[DemoRunner] A scenario is already running. Stopping it first.');
		stopScenario();
	}

	const { showCursorOnStart = true, hideCursorOnEnd = true } = options;

	// Save current state before starting
	saveStateSnapshot();

	// Reset to fresh state
	resetToDefaults();

	demoRunnerState.isRunning = true;
	demoRunnerState.isPaused = false;
	demoRunnerState.currentScenario = scenario;
	demoRunnerState.currentIndex = 0;

	console.log(`[DemoRunner] Starting scenario: ${scenario.name}`);

	if (showCursorOnStart) {
		showCursor();
	}

	try {
		for (let i = 0; i < scenario.actions.length; i++) {
			// Check if stopped
			if (!demoRunnerState.isRunning) {
				console.log('[DemoRunner] Scenario stopped.');
				break;
			}

			// Handle pause
			if (demoRunnerState.isPaused) {
				await new Promise<void>((resolve) => {
					pauseResolve = resolve;
				});
				pauseResolve = null;
			}

			// Check again after pause in case we were stopped
			if (!demoRunnerState.isRunning) {
				console.log('[DemoRunner] Scenario stopped during pause.');
				break;
			}

			demoRunnerState.currentIndex = i;
			const action = scenario.actions[i];

			await runAction(action);
		}

		console.log(`[DemoRunner] Scenario completed: ${scenario.name}`);
	} catch (error) {
		console.error(`[DemoRunner] Scenario failed:`, error);
	} finally {
		if (hideCursorOnEnd && demoRunnerState.isRunning) {
			hideCursor();
		}
		demoRunnerState.isRunning = false;
		demoRunnerState.isPaused = false;
		demoRunnerState.currentScenario = null;
		demoRunnerState.currentIndex = 0;

		// Restore state after demo ends (only if not already restored by stopScenario)
		if (savedSnapshot) {
			restoreStateSnapshot();
		}
	}
}

/**
 * Pause the currently running scenario.
 */
export function pauseScenario(): void {
	if (!demoRunnerState.isRunning) {
		console.warn('[DemoRunner] No scenario is running.');
		return;
	}
	demoRunnerState.isPaused = true;
	console.log('[DemoRunner] Scenario paused.');
}

/**
 * Resume a paused scenario.
 */
export function resumeScenario(): void {
	if (!demoRunnerState.isPaused) {
		console.warn('[DemoRunner] Scenario is not paused.');
		return;
	}
	demoRunnerState.isPaused = false;
	if (pauseResolve) {
		pauseResolve();
	}
	console.log('[DemoRunner] Scenario resumed.');
}

/**
 * Stop the currently running scenario immediately.
 */
export function stopScenario(): void {
	if (!demoRunnerState.isRunning) {
		console.warn('[DemoRunner] No scenario is running.');
		return;
	}

	// Update state first to stop the loop
	demoRunnerState.isRunning = false;
	demoRunnerState.isPaused = false;

	// Resume if paused
	if (pauseResolve) {
		pauseResolve();
		pauseResolve = null;
	}

	// Force cleanup and restore state
	restoreStateSnapshot();

	// Reset runner state
	demoRunnerState.currentScenario = null;
	demoRunnerState.currentIndex = 0;

	console.log('[DemoRunner] Scenario stopped.');
}

/**
 * Stop the demo with cursor animation to the stop button.
 * Uses the onComplete pattern like other demo actions.
 */
export function stopDemo(elementId?: string, options?: CursorOptions): void {
	moveCursorToElement(elementId, {
		...options,
		onComplete: () => {
			stopScenario();
			options?.onComplete?.();
		}
	});
}

/**
 * Step to the next action (when paused).
 */
export async function stepScenario(): Promise<void> {
	if (!demoRunnerState.isRunning || !demoRunnerState.isPaused || !demoRunnerState.currentScenario) {
		console.warn('[DemoRunner] Cannot step: not paused or no scenario.');
		return;
	}

	const nextIndex = demoRunnerState.currentIndex + 1;
	if (nextIndex >= demoRunnerState.currentScenario.actions.length) {
		console.log('[DemoRunner] No more actions to step through.');
		return;
	}

	const action = demoRunnerState.currentScenario.actions[nextIndex];
	demoRunnerState.currentIndex = nextIndex;
	await runAction(action);
}

// --- Convenience Getters ---

export function isRunning(): boolean {
	return demoRunnerState.isRunning;
}

export function isPaused(): boolean {
	return demoRunnerState.isPaused;
}

export function getCurrentScenario(): DemoScenario | null {
	return demoRunnerState.currentScenario;
}

export function getCurrentIndex(): number {
	return demoRunnerState.currentIndex;
}

export function isCursorVisible(): boolean {
	return demoCursor.visible;
}
