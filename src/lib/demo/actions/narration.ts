import type { DemoAction } from '../types';
import { narration } from '$lib/stores/narration.svelte';

export async function showNarration(action: DemoAction): Promise<void> {
	const params = action.params as {
		text: string;
		duration?: number;
		sound?: 'click' | 'brush' | 'typing';
		position?: { x: number; y: number };
	};

	if (!params?.text) {
		console.warn('[DemoAction:showNarration] Missing text param');
		return;
	}

	const duration = params.duration || 3000;

	// Pin to explicit position, or default to the Titlebar icon (top-left)
	// This makes the icon the "speaker" for all narrations
	const pin = params.position ?? { x: 10, y: 70 };

	narration.show(params.text, duration, params.sound, pin);

	// Wait for the complete narration cycle
	const totalWait = duration + 1000 + 300;
	await new Promise((resolve) => setTimeout(resolve, totalWait));
}

export async function showNarrationAsync(action: DemoAction): Promise<void> {
	const params = action.params as {
		text: string;
		duration?: number;
		sound?: 'click' | 'brush' | 'typing';
		position?: { x: number; y: number };
	};

	if (!params?.text) {
		console.warn('[DemoAction:showNarrationAsync] Missing text param');
		return;
	}

	// Pin to explicit position, or default to a fixed spot near the Titlebar icon (top-left)
	// x=0 -> left: 20px (bubble) -> tail at 40px (matches icon center ~36px)
	// y=50 -> top: 70px (bubble) -> tail at 64px (below icon bottom ~56px)
	const pin = params.position ?? { x: 10, y: 70 };

	narration.show(params.text, params.duration || 3000, params.sound, pin);
}

export async function playSound(action: DemoAction): Promise<void> {
	const params = action.params as { sound: 'click' | 'brush' | 'typing'; duration?: number };

	if (!params?.sound) {
		console.warn('[DemoAction:playSound] Missing sound param');
		return;
	}

	const duration = params.duration || (params.sound === 'click' ? 300 : undefined);
	narration.playSound(params.sound, duration);
}

export const narrationActions = {
	showNarration,
	showNarrationAsync,
	playSound
};
