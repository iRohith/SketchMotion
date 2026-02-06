import type { DemoAction, DrawStrokeParams } from '../types';
import { drawDemoStroke, drawDemoStrokes } from '$lib/utils/demoStroke';
import {
	deleteSelectedStrokes,
	deleteAllStrokes,
	undoStrokes,
	redoStrokes
} from '$lib/stores/canvas.svelte';

// --- Canvas Actions ---

export async function drawStroke(action: DemoAction): Promise<void> {
	const params = action.params as DrawStrokeParams | undefined;
	if (!params?.path || params.path.length === 0) {
		console.warn('[DemoAction:drawStroke] Missing or empty path param');
		return;
	}

	return new Promise((resolve) => {
		drawDemoStroke(params.path, {
			color: params.color,
			size: params.size,
			duration: params.duration ?? action.duration ?? 1000,
			moveDuration: params.moveDuration ?? 300,
			onComplete: () => resolve()
		});
	});
}

export async function drawStrokes(action: DemoAction): Promise<void> {
	const params = action.params as
		| { strokes: DrawStrokeParams[]; delayBetween?: number }
		| undefined;
	if (!params?.strokes || params.strokes.length === 0) {
		console.warn('[DemoAction:drawStrokes] Missing or empty strokes param');
		return;
	}

	const strokePaths = params.strokes.map((s) => ({
		path: s.path,
		options: {
			color: s.color,
			size: s.size,
			duration: s.duration ?? 1000,
			moveDuration: s.moveDuration ?? 300
		}
	}));

	await drawDemoStrokes(strokePaths, params.delayBetween ?? 300);
}

export async function deleteSelected(action: DemoAction): Promise<void> {
	return new Promise((resolve) => {
		deleteSelectedStrokes(action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

export async function deleteAll(action: DemoAction): Promise<void> {
	return new Promise((resolve) => {
		deleteAllStrokes(action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

export async function undo(): Promise<void> {
	undoStrokes();
}

export async function redo(): Promise<void> {
	redoStrokes();
}

// --- Export all canvas actions as a map ---

export const canvasActions = {
	drawStroke,
	drawStrokes,
	deleteSelected,
	deleteAll,
	undo: async () => undo(),
	redo: async () => redo()
};
