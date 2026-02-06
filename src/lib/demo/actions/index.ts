import { registerActions } from '../registry';
import { cursorActions } from './cursor';
import { toolbarActions } from './toolbar';
import { canvasActions } from './canvas';
import { analysisActions } from './analysis';

/**
 * Register all demo actions with the registry.
 * Call this once at app startup to make all actions available.
 */
export function registerAllActions(): void {
	registerActions(cursorActions);
	registerActions(toolbarActions);
	registerActions(canvasActions);
	registerActions(analysisActions);

	console.log('[DemoActions] All actions registered.');
}

// Re-export individual action modules for direct access
export { cursorActions } from './cursor';
export { toolbarActions } from './toolbar';
export { canvasActions } from './canvas';
export { analysisActions } from './analysis';
