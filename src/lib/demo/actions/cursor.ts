import type { DemoAction, DelayParams, MoveToParams } from '../types';
import {
	showCursor as showCursorFn,
	hideCursor as hideCursorFn,
	demoCursor,
	moveCursorToElement,
	animateCursor
} from '$lib/stores/demoCursor.svelte';
import { stopDemo as stopDemoFn } from '$lib/stores/demoRunner.svelte';

// --- Cursor Actions ---

export async function show(): Promise<void> {
	showCursorFn();
}

export async function hide(): Promise<void> {
	hideCursorFn();
}

export async function delay(action: DemoAction): Promise<void> {
	const params = action.params as DelayParams | undefined;
	const ms = params?.ms ?? 500;
	await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function moveTo(action: DemoAction): Promise<void> {
	const params = action.params as MoveToParams | undefined;
	if (!params) {
		console.warn('[DemoAction:moveTo] Missing params');
		return;
	}

	const duration = action.duration ?? 300;

	await animateCursor([{ x: params.x, y: params.y }], {
		duration,
		action: 'none'
	});
}

export async function moveToElement(action: DemoAction): Promise<void> {
	const elementId = action.elementId;
	if (!elementId) {
		console.warn('[DemoAction:moveToElement] Missing elementId');
		return;
	}

	const duration = action.duration ?? 300;

	await moveCursorToElement(elementId, {
		duration,
		action: 'none'
	});
}

export async function click(action: DemoAction): Promise<void> {
	const elementId = action.elementId;
	if (!elementId) {
		console.warn('[DemoAction:click] Missing elementId');
		return;
	}

	const duration = action.duration ?? 300;

	await moveCursorToElement(elementId, {
		duration,
		action: 'click'
	});
}

export async function setCursorPosition(action: DemoAction): Promise<void> {
	const params = action.params as MoveToParams | undefined;
	if (!params) {
		console.warn('[DemoAction:setCursorPosition] Missing params');
		return;
	}

	demoCursor.x = params.x;
	demoCursor.y = params.y;
}

/**
 * Stop the demo by moving cursor to element and then stopping.
 * Uses the onComplete pattern to properly stop the scenario.
 */
export async function stopDemo(action: DemoAction): Promise<void> {
	const elementId = action.elementId ?? 'demo-button';
	const duration = action.duration ?? 600;

	return new Promise((resolve) => {
		stopDemoFn(elementId, {
			duration,
			onComplete: () => resolve()
		});
	});
}

// --- Export all cursor actions as a map ---

export const cursorActions = {
	show: async () => show(),
	hide: async () => hide(),
	delay,
	moveTo,
	moveToElement,
	click,
	setCursorPosition,
	stopDemo
};
