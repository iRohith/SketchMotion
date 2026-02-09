import type { BoundingBox, Point } from '$lib/types';

// --- Action Types ---

export type DemoAction = {
	/** Action identifier, e.g., "setBrushColor", "drawStroke", "delay" */
	action: string;
	/** Action-specific parameters */
	params?: Record<string, unknown>;
	/** Optional target element for cursor animation */
	elementId?: string;
	/** Duration for cursor movement in ms */
	duration?: number;
};

export type DemoScenario = {
	name: string;
	description?: string;
	actions: DemoAction[];
};

// --- Action Handler Type ---

export type ActionHandler = (action: DemoAction) => Promise<void>;

// --- Common Parameter Types ---

export type DrawStrokeParams = {
	id?: string;
	path: Point[];
	color?: string;
	size?: number;
	duration?: number;
	moveDuration?: number;
};

export type DelayParams = {
	ms: number;
};

export type MoveToParams = {
	x: number;
	y: number;
};

export type SetColorParams = {
	color: string;
};

export type SetSizeParams = {
	size: number;
};

export type SetModeParams = {
	mode: 'brush' | 'select';
};

export type SetLayerParams = {
	layer: 'start' | 'motion' | 'end' | 'final';
};

export type HoverResponseParams = {
	response: 'yes' | 'no';
};

export type ShowHoverParams = {
	clusterId: string;
	bounds: BoundingBox;
	title?: string;
	content?: string;
	analysisItemId?: string;
};
