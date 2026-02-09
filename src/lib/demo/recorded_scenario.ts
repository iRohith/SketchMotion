import type { DemoScenario, DemoAction } from './types';
import drawingData from '../assets/drawing.json';
import type { Stroke } from '$lib/types';

// Type assertion for the imported JSON
// Type assertion for the imported JSON
type RecordedData = Stroke[];

const recordedData = drawingData as unknown as RecordedData;

// Convert recorded actions to demo actions
function createScenarioFromRecording(): DemoAction[] {
	const actions: DemoAction[] = [{ action: 'show' }, { action: 'delay', params: { ms: 500 } }];

	let currentColor = '';
	let currentSize = 0;
	const delayBetweenStrokes = 300; // Requested fixed delay
	const TARGET_DURATION_PER_COLOR = 5000; // 5 seconds per color group

	// Pass 1: Aggregate durations by color
	const colorDurations: Record<string, number> = {};

	recordedData.forEach((stroke) => {
		const color = stroke.color;
		const points = stroke.points;
		const duration = points.length > 0 ? points[points.length - 1].t : 1000;
		if (!colorDurations[color]) {
			colorDurations[color] = 0;
		}
		colorDurations[color] += duration;
	});

	// Pass 2: Calculate scale factors
	const colorScales: Record<string, number> = {};
	for (const [color, totalDuration] of Object.entries(colorDurations)) {
		if (totalDuration > 0) {
			colorScales[color] = TARGET_DURATION_PER_COLOR / totalDuration;
			console.log(
				`[RecordedDemo] Color ${color}: ${totalDuration.toFixed(0)}ms -> ${TARGET_DURATION_PER_COLOR}ms (Scale: ${colorScales[color].toFixed(2)}x)`
			);
		} else {
			colorScales[color] = 1;
		}
	}

	// Pass 3: Generate Actions
	recordedData.forEach((stroke) => {
		// Handle Color Change
		if (stroke.color !== currentColor) {
			actions.push({
				action: 'setBrushColor',
				params: { color: stroke.color },
				elementId: `tool-color-${stroke.color}`,
				duration: 400
			});
			actions.push({ action: 'delay', params: { ms: 100 } });
			currentColor = stroke.color;
		}

		if (stroke.size !== currentSize) {
			currentSize = stroke.size;
		}

		// Calculate specific duration
		const points = stroke.points;
		const originalStrokeDuration = points.length > 0 ? points[points.length - 1].t : 1000;
		const scale = colorScales[stroke.color] || 1;
		const scaledDuration = originalStrokeDuration * scale;

		actions.push({
			action: 'drawStroke',
			params: {
				path: points.map((p) => ({ x: p.x, y: p.y })),
				color: stroke.color,
				size: stroke.size,
				duration: scaledDuration, // Scaled by color group budget
				moveDuration: 400
			}
		});

		// Add fixed delay after stroke
		actions.push({ action: 'delay', params: { ms: delayBetweenStrokes } });
	});

	// End demo
	actions.push({ action: 'delay', params: { ms: 1000 } });
	actions.push({ action: 'stopDemo', elementId: 'demo-button', duration: 1000 });

	return actions;
}

export const recordedDemo: DemoScenario = {
	name: 'Recorded Demo',
	description: 'Replay of recorded session from assets/drawing.json',
	actions: createScenarioFromRecording()
};
