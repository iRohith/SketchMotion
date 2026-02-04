import { Layer } from '$lib/types';
import { BRUSH_SIZES, COLORS } from '$lib/utils/constants';
import { requestRender } from './canvas.svelte';
import { moveCursorToElement, type CursorOptions } from './demoCursor.svelte';

export interface CanvasToolbarState {
	activeLayer: Layer;
	selectedIds: string[];
	mode: 'brush' | 'select';
	groupSelect: boolean;
	brushSize: number;
	brushColor: string;
	backgroundColor: string;
	hoveredStrokeId: string | null;
}

export const canvasToolbarState: CanvasToolbarState = $state({
	activeLayer: Layer.START,
	selectedIds: [],
	mode: 'brush',
	groupSelect: true,
	brushSize: BRUSH_SIZES[1],
	brushColor: COLORS.white,
	backgroundColor: COLORS.black,
	hoveredStrokeId: null
});

export function getCanvasToolbarState() {
	return canvasToolbarState;
}

export function setActiveLayer(layer: Layer, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasToolbarState.activeLayer = layer;
			canvasToolbarState.selectedIds = [];
			requestRender();
		},
		...options
	});
}

export function getActiveLayer() {
	return canvasToolbarState.activeLayer;
}

export function setMode(mode: 'brush' | 'select', elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasToolbarState.mode = mode;
		},
		...options
	});
}

export function getMode() {
	return canvasToolbarState.mode;
}

export function setGroupSelect(groupSelect: boolean, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasToolbarState.groupSelect = groupSelect;
		},
		...options
	});
}

export function getGroupSelect() {
	return canvasToolbarState.groupSelect;
}

export function setBrushSize(brushSize: number, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			if (canvasToolbarState.mode == 'select') {
				canvasToolbarState.mode = 'brush';
			}
			canvasToolbarState.brushSize = brushSize;
		},
		...options
	});
}

export function getBrushSize() {
	return canvasToolbarState.brushSize;
}

export function setBrushColor(brushColor: string, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasToolbarState.mode = 'brush';
			canvasToolbarState.brushColor = brushColor;
		},
		...options
	});
}

export function getBrushColor() {
	return canvasToolbarState.brushColor;
}

export function setBackgroundColor(
	backgroundColor: string,
	elementId?: string,
	options?: CursorOptions
) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasToolbarState.backgroundColor = backgroundColor;
		},
		...options
	});
}

export function getBackgroundColor() {
	return canvasToolbarState.backgroundColor;
}
