import type { ActionHandler, DemoAction } from './types';

// --- Action Registry ---

const actionRegistry = new Map<string, ActionHandler>();

/**
 * Register an action handler.
 * @param name - The action identifier (e.g., "setBrushColor")
 * @param handler - The async function to execute when the action is called
 */
export function registerAction(name: string, handler: ActionHandler): void {
	if (actionRegistry.has(name)) {
		console.warn(`[DemoRegistry] Overwriting existing action: ${name}`);
	}
	actionRegistry.set(name, handler);
}

/**
 * Register multiple actions at once.
 * @param actions - Object mapping action names to handlers
 */
export function registerActions(actions: Record<string, ActionHandler>): void {
	for (const [name, handler] of Object.entries(actions)) {
		registerAction(name, handler);
	}
}

/**
 * Check if an action is registered.
 */
export function hasAction(name: string): boolean {
	return actionRegistry.has(name);
}

/**
 * Get all registered action names.
 */
export function getActionNames(): string[] {
	return Array.from(actionRegistry.keys());
}

/**
 * Run a single action by name.
 * @param action - The action to execute
 * @returns Promise that resolves when the action completes
 */
export async function runAction(action: DemoAction): Promise<void> {
	const handler = actionRegistry.get(action.action);
	if (!handler) {
		console.error(`[DemoRegistry] Unknown action: ${action.action}`);
		console.log('[DemoRegistry] Available actions:', getActionNames());
		return;
	}

	try {
		await handler(action);
	} catch (error) {
		console.error(`[DemoRegistry] Action "${action.action}" failed:`, error);
		throw error;
	}
}

/**
 * Run multiple actions sequentially.
 * @param actions - Array of actions to execute in order
 */
export async function runActions(actions: DemoAction[]): Promise<void> {
	for (const action of actions) {
		await runAction(action);
	}
}
