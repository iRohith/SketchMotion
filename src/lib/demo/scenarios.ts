import type { DemoScenario } from './types';
import { COLORS } from '$lib/utils/constants';

/**
 * Sample demo scenario that showcases the drawing capabilities.
 * Cursor moves visibly between UI elements, clicking buttons before drawing.
 * Ends by using stopDemo action to properly stop via cursor animation.
 */
export const quickDrawDemo: DemoScenario = {
	name: 'Quick Draw Demo',
	description: 'Demonstrates cursor movement and stroke drawing with visible button clicks',
	actions: [
		// Show cursor and position
		{ action: 'show' },
		{ action: 'delay', params: { ms: 400 } },

		// Click brush mode toggle
		{
			action: 'click',
			elementId: 'tool-draw',
			duration: 500
		},
		{ action: 'delay', params: { ms: 200 } },

		// Move to and click color picker (pink color)
		{
			action: 'setBrushColor',
			params: { color: COLORS.pink },
			elementId: `tool-color-${COLORS.pink}`,
			duration: 600
		},
		{ action: 'delay', params: { ms: 200 } },

		// Move to and click brush size (size 5)
		{
			action: 'setBrushSize',
			params: { size: 5 },
			elementId: 'size-5',
			duration: 500
		},
		{ action: 'delay', params: { ms: 300 } },

		// Now draw the stroke
		{
			action: 'drawStroke',
			params: {
				path: [
					{ x: 150, y: 300 },
					{ x: 200, y: 200 },
					{ x: 300, y: 250 },
					{ x: 400, y: 150 },
					{ x: 500, y: 200 },
					{ x: 550, y: 300 },
					{ x: 600, y: 250 }
				],
				duration: 1500,
				moveDuration: 400
			}
		},

		// Trigger analysis manually (instead of waiting for idle timeout)
		{ action: 'delay', params: { ms: 300 } },
		{ action: 'triggerAnalysis' },

		// Wait for analysis hover interaction to complete
		{ action: 'delay', params: { ms: 3000 } },

		// Stop demo properly via cursor animation to stop button
		{
			action: 'stopDemo',
			elementId: 'demo-button',
			duration: 600
		}
	]
};

/**
 * Full demo scenario with multiple strokes and color changes.
 */
export const fullDemo: DemoScenario = {
	name: 'Full Demo',
	description: 'Complete demo with drawing and color changes',
	actions: [
		{ action: 'show' },
		{ action: 'delay', params: { ms: 400 } },

		// Click brush tool
		{
			action: 'click',
			elementId: 'tool-draw',
			duration: 500
		},
		{ action: 'delay', params: { ms: 200 } },

		// Select cyan color
		{
			action: 'setBrushColor',
			params: { color: COLORS.cyan },
			elementId: `tool-color-${COLORS.cyan}`,
			duration: 600
		},
		{ action: 'delay', params: { ms: 200 } },

		// Draw first shape
		{
			action: 'drawStroke',
			params: {
				path: [
					{ x: 200, y: 250 },
					{ x: 280, y: 180 },
					{ x: 360, y: 250 },
					{ x: 280, y: 320 },
					{ x: 200, y: 250 }
				],
				duration: 1200,
				moveDuration: 400
			}
		},

		// Trigger analysis for first stroke
		{ action: 'delay', params: { ms: 300 } },
		{ action: 'triggerAnalysis' },
		{ action: 'delay', params: { ms: 2500 } },

		// Change to yellow
		{
			action: 'setBrushColor',
			params: { color: COLORS.yellow },
			elementId: `tool-color-${COLORS.yellow}`,
			duration: 600
		},
		{ action: 'delay', params: { ms: 200 } },

		// Draw second shape
		{
			action: 'drawStroke',
			params: {
				path: [
					{ x: 450, y: 200 },
					{ x: 550, y: 200 },
					{ x: 600, y: 280 },
					{ x: 550, y: 360 },
					{ x: 450, y: 360 },
					{ x: 400, y: 280 },
					{ x: 450, y: 200 }
				],
				duration: 1400,
				moveDuration: 400
			}
		},

		// Trigger analysis for second stroke
		{ action: 'delay', params: { ms: 300 } },
		{ action: 'triggerAnalysis' },
		{ action: 'delay', params: { ms: 2500 } },

		// Stop demo properly
		{
			action: 'stopDemo',
			elementId: 'demo-button',
			duration: 600
		}
	]
};

// All available demo scenarios
export const demoScenarios = {
	quickDraw: quickDrawDemo,
	full: fullDemo
};
