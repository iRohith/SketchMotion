import type { DemoAction } from '../types';
import { narration } from '$lib/stores/narration.svelte';

export async function showNarration(action: DemoAction): Promise<void> {
	const params = action.params as {
		text: string;
		duration?: number;
		sound?: 'click' | 'brush' | 'typing';
	};

	if (!params?.text) {
		console.warn('[DemoAction:showNarration] Missing text param');
		return;
	}

	const duration = params.duration || 3000;

	// Start the narration
	narration.show(params.text, duration, params.sound);

	// Wait for the complete narration cycle:
	// - typing duration
	// - 1 second post-message wait
	// - 300ms fade-out animation
	const totalWait = duration + 1000 + 300;
	await new Promise((resolve) => setTimeout(resolve, totalWait));
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
	playSound
};
