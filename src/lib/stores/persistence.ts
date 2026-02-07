// localStorage persistence utilities for SketchMotion

const STORAGE_PREFIX = 'sketchmotion:';

// Keys for different state
export const STORAGE_KEYS = {
	SESSION_ID: `${STORAGE_PREFIX}sessionId`,
	CLIENT_ID: `${STORAGE_PREFIX}clientId`,
	STROKES: `${STORAGE_PREFIX}strokes`,
	ANALYSIS_ITEMS: `${STORAGE_PREFIX}analysisItems`
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
	localStorage.removeItem(STORAGE_KEYS.STROKES);
	localStorage.removeItem(STORAGE_KEYS.ANALYSIS_ITEMS);
	// Note: CLIENT_ID is not removed - it persists across resets
}

// Check if we have a saved session
export function hasSavedSession(): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(STORAGE_KEYS.SESSION_ID) !== null;
}
