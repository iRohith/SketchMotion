// localStorage persistence utilities for SketchMotion
import type { Stroke } from '$lib/types';
import type { AnalysisItem } from '$lib/stores/analysis.svelte';
import type { AutoAnalysisState, TrackedCluster } from '$lib/stores/autoAnalysis.svelte';
import type { CanvasToolbarState } from '$lib/stores/canvasToolbar.svelte';

const STORAGE_PREFIX = 'sketchmotion:';

// ... (keep constants and session functions unchanged) ...

// Keys for different state
export const STORAGE_KEYS = {
	SESSION_ID: `${STORAGE_PREFIX}sessionId`,
	CLIENT_ID: `${STORAGE_PREFIX}clientId`,
	WORKSPACE: `${STORAGE_PREFIX}workspace`
} as const;

// Session management
export function getOrCreateSessionId(): string {
	if (typeof localStorage === 'undefined') return crypto.randomUUID();

	const saved = localStorage.getItem(STORAGE_KEYS.SESSION_ID);
	if (saved) return saved;

	const newId = crypto.randomUUID();
	localStorage.setItem(STORAGE_KEYS.SESSION_ID, newId);
	return newId;
}

export function getSessionId(): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(STORAGE_KEYS.SESSION_ID);
}

export function clearSessionId(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
}

// Client ID (persistent across sessions)
export function getOrCreateClientId(): string {
	if (typeof localStorage === 'undefined') return crypto.randomUUID();

	const saved = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
	if (saved) return saved;

	const newId = crypto.randomUUID();
	localStorage.setItem(STORAGE_KEYS.CLIENT_ID, newId);
	return newId;
}

// Reset all session-related state (called on canvas clear)
export function resetSessionState(): void {
	if (typeof localStorage === 'undefined') return;

	localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
	localStorage.removeItem(STORAGE_KEYS.WORKSPACE);
	// Note: CLIENT_ID is not removed - it persists across resets
}

// Check if we have a saved session
export function hasSavedSession(): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(STORAGE_KEYS.WORKSPACE) !== null;
}

// Serialization Helpers with Map/Set support
export function replacer(key: string, value: unknown) {
	if (value instanceof Map) {
		return { dataType: 'Map', value: Array.from(value.entries()) };
	} else if (value instanceof Set) {
		return { dataType: 'Set', value: Array.from(value) };
	} else {
		return value;
	}
}

export function reviver(key: string, value: unknown) {
	if (typeof value === 'object' && value !== null) {
		const v = value as { dataType?: string; value?: unknown };
		if (v.dataType === 'Map' && Array.isArray(v.value)) {
			return new Map(v.value as [unknown, unknown][]);
		}
		if (v.dataType === 'Set' && Array.isArray(v.value)) {
			return new Set(v.value as unknown[]);
		}
	}
	return value;
}

// Workspace State Types
export interface WorkspaceState {
	sessionId: string;
	timestamp: number;
	clientIds: string;
	strokes: Map<string, Stroke>;
	groups: Map<string, Set<string>>;
	strokeGroupMap: Map<string, string>;
	groupStateVersion: number;
	analysisItems: AnalysisItem[];
	trackedClusters: Map<string, TrackedCluster>;
	canvasToolbar: CanvasToolbarState;
	autoAnalysis: AutoAnalysisState;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function saveWorkspaceDebounced(state: WorkspaceState, delay = 1000): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		saveWorkspace(state);
		saveTimeout = null;
	}, delay);
}

export function saveWorkspace(state: WorkspaceState): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const json = JSON.stringify(state, replacer);
		localStorage.setItem(STORAGE_KEYS.WORKSPACE, json);
		console.log('[Persistence] Workspace saved', new Date().toISOString());
	} catch (e) {
		console.error('Failed to save workspace to localStorage:', e);
	}
}

export function loadWorkspace(): WorkspaceState | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const json = localStorage.getItem(STORAGE_KEYS.WORKSPACE);
		if (!json) return null;
		return JSON.parse(json, reviver) as WorkspaceState;
	} catch (e) {
		console.error('Failed to load workspace from localStorage:', e);
		return null;
	}
}
