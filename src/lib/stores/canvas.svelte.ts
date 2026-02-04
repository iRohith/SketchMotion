import { Layer } from '$lib/types';
import { BRUSH_SIZES, COLORS } from '$lib/utils/constants';
import { moveCursorToElement, type CursorOptions } from './demoCursor.svelte';

export interface CanvasToolbarState {
	activeLayer: Layer;
	mode: 'brush' | 'select' | 'eraser';
	groupSelect: boolean;
	brushSize: number;
	brushColor: string;
	backgroundColor: string;
}

const canvasState: CanvasToolbarState = $state({
	activeLayer: Layer.START,
	mode: 'brush',
	groupSelect: true,
	brushSize: BRUSH_SIZES[1],
	brushColor: COLORS.white,
	backgroundColor: COLORS.black
});

export function setActiveLayer(layer: Layer, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasState.activeLayer = layer;
		},
		...options
	});
}

export function getActiveLayer() {
	return canvasState.activeLayer;
}

export function setMode(
	mode: 'brush' | 'select' | 'eraser',
	elementId?: string,
	options?: CursorOptions
) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasState.mode = mode;
		},
		...options
	});
}

export function getMode() {
	return canvasState.mode;
}

export function setGroupSelect(groupSelect: boolean, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasState.groupSelect = groupSelect;
		},
		...options
	});
}

export function getGroupSelect() {
	return canvasState.groupSelect;
}

export function setEraserMode(isEraser: boolean, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			if (isEraser) {
				canvasState.mode = 'eraser';
			} else {
				canvasState.mode = 'brush';
			}
		},
		...options
	});
}

export function getEraserMode() {
	return canvasState.mode === 'eraser';
}

export function setBrushSize(brushSize: number, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			if (canvasState.mode == 'select') {
				canvasState.mode = 'brush';
			}
			canvasState.brushSize = brushSize;
		},
		...options
	});
}

export function getBrushSize() {
	return canvasState.brushSize;
}

export function setBrushColor(brushColor: string, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasState.mode = 'brush';
			canvasState.brushColor = brushColor;
		},
		...options
	});
}

export function getBrushColor() {
	return canvasState.brushColor;
}

export function setBackgroundColor(
	backgroundColor: string,
	elementId?: string,
	options?: CursorOptions
) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasState.backgroundColor = backgroundColor;
		},
		...options
	});
}

export function getBackgroundColor() {
	return canvasState.backgroundColor;
}
