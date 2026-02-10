import type { DemoAction, DrawStrokeParams } from '../types';
import { drawDemoStroke, drawDemoStrokes } from '$lib/utils/demoStroke';
import {
	deleteSelectedStrokes,
	deleteAllStrokes,
	undoStrokes,
	redoStrokes,
	getStrokeIdsInGroup,
	addStroke,
	calculateBoundingBox,
	deleteStroke,
	requestRender,
	strokes,
	commitStrokeHistory
} from '$lib/stores/canvas.svelte';
import { removeWhiteBackground } from '$lib/utils/image';
import type { Stroke } from '$lib/types';

// --- Canvas Actions ---

export async function replaceGroupWithImage(action: DemoAction): Promise<void> {
	const params = action.params as { groupId: string; imageUrl: string };
	if (!params?.groupId || !params?.imageUrl) {
		console.warn('[DemoAction:replaceGroupWithImage] Missing groupId or imageUrl');
		return;
	}

	// 1. Get strokes in group
	const strokeIds = getStrokeIdsInGroup(params.groupId);
	if (strokeIds.length === 0) {
		console.warn(`[DemoAction:replaceGroupWithImage] No strokes found for group ${params.groupId}`);
		return;
	}

	const groupStrokes: Stroke[] = [];
	strokeIds.forEach((id) => {
		const s = strokes.get(id);
		if (s) groupStrokes.push(s);
	});

	if (groupStrokes.length === 0) return;

	// 2. Calculate bounding box of the group
	const bbox = calculateBoundingBox(groupStrokes);
	if (!bbox) return;

	// 3. Process image (remove white background)
	try {
		const processedUrl = await removeWhiteBackground(params.imageUrl);

		// 4. Create new stroke that acts as the image container
		const newStroke: Stroke = {
			id: `image-${params.groupId}-${Date.now()}`,
			points: [
				{ x: bbox.minX, y: bbox.minY, t: 0 },
				{ x: bbox.maxX, y: bbox.minY, t: 0 },
				{ x: bbox.maxX, y: bbox.maxY, t: 0 },
				{ x: bbox.minX, y: bbox.maxY, t: 0 },
				// Close the loop for cleaner bounding box calc if re-calc happen
				{ x: bbox.minX, y: bbox.minY, t: 0 }
			],
			color: '#000000', // Irrelevant for image
			size: 0,
			layer: groupStrokes[0].layer,
			image: processedUrl,
			bounding: bbox
		};

		// 5. Delete old strokes
		strokeIds.forEach((id) => deleteStroke(id));

		// 6. Add new image stroke
		addStroke(newStroke);
		commitStrokeHistory();
		requestRender();
	} catch (error) {
		console.error('[DemoAction:replaceGroupWithImage] Failed to process image:', error);
	}
}

export async function drawStroke(action: DemoAction): Promise<void> {
	const params = action.params as DrawStrokeParams | undefined;
	if (!params?.path || params.path.length === 0) {
		console.warn('[DemoAction:drawStroke] Missing or empty path param');
		return;
	}

	return new Promise((resolve) => {
		drawDemoStroke(params.path, {
			id: params.id,
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
			id: s.id,
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
	replaceGroupWithImage,
	deleteSelected,
	deleteAll,
	undo: async () => undo(),
	redo: async () => redo()
};
