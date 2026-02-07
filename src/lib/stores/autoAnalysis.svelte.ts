import type { BoundingBox } from './analysis.svelte';

// --- Types ---

export type QueueItem = {
	id: string;
	clusterId: string;
	strokeIds: Set<string>;
	timestamp: number;
	status: 'pending' | 'awaiting' | 'sending' | 'sent';
};

export type TrackedCluster = {
	strokeIds: Set<string>;
	analysisItemId: string | null;
	bounds: BoundingBox;
	lastUpdate: number;
	skipped: boolean;
	// Session tracking for iterative feedback
	sessionId?: string;
	preAIMergeStrokeIds?: Set<string>; // Original state before AI merge
	retryCount: number;
	lastTitle?: string; // For sending with feedback
};

// --- State ---

export const autoAnalysisState = $state({
	analysisQueue: [] as QueueItem[],
	isSending: false,
	lastSnapshotTime: 0
});

// trackedClusters is a Map - use reactive wrapper
export const trackedClusters = new Map<string, TrackedCluster>();

// debounceTimer reference
let debounceTimerId: ReturnType<typeof setTimeout> | null = null;

// --- Functions ---

/**
 * Set/get debounce timer for analysis accumulation
 */
export function setDebounceTimer(timer: ReturnType<typeof setTimeout> | null) {
	debounceTimerId = timer;
}

export function getDebounceTimer(): ReturnType<typeof setTimeout> | null {
	return debounceTimerId;
}

export function clearDebounceTimer() {
	if (debounceTimerId) {
		clearTimeout(debounceTimerId);
		debounceTimerId = null;
	}
}

/**
 * Reset all auto-analysis state to initial values.
 * Call this when demo ends to ensure fresh state.
 */
export function resetAutoAnalysisState(): void {
	// Clear debounce timer
	clearDebounceTimer();

	// Reset queue
	autoAnalysisState.analysisQueue = [];
	autoAnalysisState.isSending = false;
	autoAnalysisState.lastSnapshotTime = 0;

	// Clear tracked clusters
	trackedClusters.clear();

	console.log('[AutoAnalysis] State reset');
}

/**
 * Clear just the tracked clusters (for partial reset)
 */
export function clearTrackedClusters(): void {
	trackedClusters.clear();
}

/**
 * Update last snapshot time
 */
export function setLastSnapshotTime(time: number): void {
	autoAnalysisState.lastSnapshotTime = time;
}

/**
 * Get last snapshot time
 */
export function getLastSnapshotTime(): number {
	return autoAnalysisState.lastSnapshotTime;
}
