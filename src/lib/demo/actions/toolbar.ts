import type {
	DemoAction,
	SetColorParams,
	SetSizeParams,
	SetModeParams,
	SetLayerParams
} from '../types';
import {
	setMode as setModeFn,
	setBrushSize as setBrushSizeFn,
	setBrushColor as setBrushColorFn,
	setBackgroundColor as setBackgroundColorFn,
	setActiveLayer as setActiveLayerFn,
	setGroupSelect as setGroupSelectFn,
	canvasToolbarState
} from '$lib/stores/canvasToolbar.svelte';
import { Layer } from '$lib/types';

// --- Toolbar Actions ---

export async function setMode(action: DemoAction): Promise<void> {
	const params = action.params as SetModeParams | undefined;
	if (!params?.mode) {
		console.warn('[DemoAction:setMode] Missing mode param');
		return;
	}

	// Skip if already in intended state
	if (canvasToolbarState.mode === params.mode) {
		console.log(`[DemoAction:setMode] Already in ${params.mode} mode, skipping`);
		return;
	}

	return new Promise((resolve) => {
		setModeFn(params.mode, action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

export async function setBrushSize(action: DemoAction): Promise<void> {
	const params = action.params as SetSizeParams | undefined;
	if (params?.size === undefined) {
		console.warn('[DemoAction:setBrushSize] Missing size param');
		return;
	}

	// Skip if already in intended state
	if (canvasToolbarState.brushSize === params.size) {
		console.log(`[DemoAction:setBrushSize] Already at size ${params.size}, skipping`);
		return;
	}

	return new Promise((resolve) => {
		setBrushSizeFn(params.size, action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

export async function setBrushColor(action: DemoAction): Promise<void> {
	const params = action.params as SetColorParams | undefined;
	if (!params?.color) {
		console.warn('[DemoAction:setBrushColor] Missing color param');
		return;
	}

	// Skip if already in intended state
	if (canvasToolbarState.brushColor === params.color) {
		console.log(`[DemoAction:setBrushColor] Already at color ${params.color}, skipping`);
		return;
	}

	return new Promise((resolve) => {
		setBrushColorFn(params.color, action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

export async function setBackgroundColor(action: DemoAction): Promise<void> {
	const params = action.params as SetColorParams | undefined;
	if (!params?.color) {
		console.warn('[DemoAction:setBackgroundColor] Missing color param');
		return;
	}

	// Skip if already in intended state
	if (canvasToolbarState.backgroundColor === params.color) {
		console.log(`[DemoAction:setBackgroundColor] Already at color ${params.color}, skipping`);
		return;
	}

	return new Promise((resolve) => {
		setBackgroundColorFn(params.color, action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

export async function setActiveLayer(action: DemoAction): Promise<void> {
	const params = action.params as SetLayerParams | undefined;
	if (!params?.layer) {
		console.warn('[DemoAction:setActiveLayer] Missing layer param');
		return;
	}

	const layerMap: Record<string, Layer> = {
		start: Layer.START,
		motion: Layer.MOTION,
		end: Layer.END,
		final: Layer.FINAL
	};

	const layer = layerMap[params.layer];
	if (layer === undefined) {
		console.warn('[DemoAction:setActiveLayer] Invalid layer:', params.layer);
		return;
	}

	// Skip if already in intended state
	if (canvasToolbarState.activeLayer === layer) {
		console.log(`[DemoAction:setActiveLayer] Already on layer ${params.layer}, skipping`);
		return;
	}

	return new Promise((resolve) => {
		setActiveLayerFn(layer, action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

export async function setGroupSelect(action: DemoAction): Promise<void> {
	const params = action.params as { groupSelect: boolean } | undefined;
	if (params?.groupSelect === undefined) {
		console.warn('[DemoAction:setGroupSelect] Missing groupSelect param');
		return;
	}

	// Skip if already in intended state
	if (canvasToolbarState.groupSelect === params.groupSelect) {
		console.log(`[DemoAction:setGroupSelect] Already ${params.groupSelect}, skipping`);
		return;
	}

	return new Promise((resolve) => {
		setGroupSelectFn(params.groupSelect, action.elementId, {
			duration: action.duration,
			onComplete: () => resolve()
		});
	});
}

// --- Export all toolbar actions as a map ---

export const toolbarActions = {
	setMode,
	setBrushSize,
	setBrushColor,
	setBackgroundColor,
	setActiveLayer,
	setGroupSelect
};
