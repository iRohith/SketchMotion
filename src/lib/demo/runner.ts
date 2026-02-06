import type { DemoScenario } from './types';
import { runAction } from './registry';
import { showCursor, hideCursor, demoCursor } from '$lib/stores/demoCursor.svelte';

// --- Runner State ---

type RunnerState = {
	isRunning: boolean;
	isPaused: boolean;
	currentScenario: DemoScenario | null;
	currentIndex: number;
	pauseResolve: (() => void) | null;
};

const state: RunnerState = {
	isRunning: false,
	isPaused: false,
	currentScenario: null,
	currentIndex: 0,
	pauseResolve: null
};

// --- Public API ---

/**
 * Run a demo scenario.
 * @param scenario - The scenario to execute
 * @param options - Optional settings
 */
export async function runScenario(
	scenario: DemoScenario,
	options: { showCursorOnStart?: boolean; hideCursorOnEnd?: boolean } = {}
): Promise<void> {
	if (state.isRunning) {
		console.warn('[DemoRunner] A scenario is already running. Stopping it first.');
		stopScenario();
	}

	const { showCursorOnStart = true, hideCursorOnEnd = false } = options;

	state.isRunning = true;
	state.isPaused = false;
	state.currentScenario = scenario;
	state.currentIndex = 0;

	console.log(`[DemoRunner] Starting scenario: ${scenario.name}`);

	if (showCursorOnStart) {
		showCursor();
	}

	try {
		for (let i = 0; i < scenario.actions.length; i++) {
			// Check if stopped
			if (!state.isRunning) {
				console.log('[DemoRunner] Scenario stopped.');
				break;
			}

			// Handle pause
			if (state.isPaused) {
				await new Promise<void>((resolve) => {
					state.pauseResolve = resolve;
				});
				state.pauseResolve = null;
			}

			// Check again after pause in case we were stopped
			if (!state.isRunning) {
				console.log('[DemoRunner] Scenario stopped during pause.');
				break;
			}

			state.currentIndex = i;
			const action = scenario.actions[i];

			await runAction(action);
		}

		console.log(`[DemoRunner] Scenario completed: ${scenario.name}`);
	} catch (error) {
		console.error(`[DemoRunner] Scenario failed:`, error);
	} finally {
		if (hideCursorOnEnd && state.isRunning) {
			hideCursor();
		}
		state.isRunning = false;
		state.isPaused = false;
		state.currentScenario = null;
		state.currentIndex = 0;
	}
}

/**
 * Pause the currently running scenario.
 */
export function pauseScenario(): void {
	if (!state.isRunning) {
		console.warn('[DemoRunner] No scenario is running.');
		return;
	}
	state.isPaused = true;
	console.log('[DemoRunner] Scenario paused.');
}

/**
 * Resume a paused scenario.
 */
export function resumeScenario(): void {
	if (!state.isPaused) {
		console.warn('[DemoRunner] Scenario is not paused.');
		return;
	}
	state.isPaused = false;
	if (state.pauseResolve) {
		state.pauseResolve();
	}
	console.log('[DemoRunner] Scenario resumed.');
}

/**
 * Stop the currently running scenario.
 */
export function stopScenario(): void {
	if (!state.isRunning) {
		console.warn('[DemoRunner] No scenario is running.');
		return;
	}
	state.isRunning = false;
	state.isPaused = false;
	if (state.pauseResolve) {
		state.pauseResolve();
	}
	hideCursor();
	console.log('[DemoRunner] Scenario stopped.');
}

/**
 * Step to the next action (when paused).
 */
export async function stepScenario(): Promise<void> {
	if (!state.isRunning || !state.isPaused || !state.currentScenario) {
		console.warn('[DemoRunner] Cannot step: not paused or no scenario.');
		return;
	}

	const nextIndex = state.currentIndex + 1;
	if (nextIndex >= state.currentScenario.actions.length) {
		console.log('[DemoRunner] No more actions to step through.');
		return;
	}

	const action = state.currentScenario.actions[nextIndex];
	state.currentIndex = nextIndex;
	await runAction(action);
}

// --- Getters ---

export function isRunning(): boolean {
	return state.isRunning;
}

export function isPaused(): boolean {
	return state.isPaused;
}

export function getCurrentScenario(): DemoScenario | null {
	return state.currentScenario;
}

export function getCurrentIndex(): number {
	return state.currentIndex;
}

export function isCursorVisible(): boolean {
	return demoCursor.visible;
}
