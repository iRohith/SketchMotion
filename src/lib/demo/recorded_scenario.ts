import type { DemoScenario, DemoAction } from './types';
import drawingData from '../assets/drawing.json';
import type { Stroke } from '$lib/types';

// Type assertion for the imported JSON
type RecordedData = Stroke[];

const recordedData = drawingData as unknown as RecordedData;

// Convert recorded actions to demo actions
function createScenarioFromRecording(): DemoAction[] {
	const actions: DemoAction[] = [{ action: 'show' }, { action: 'delay', params: { ms: 500 } }];

	let currentColor = '';
	const delayBetweenStrokes = 200;
	const TARGET_DURATION_PER_COLOR = 3000;

	// Pass 1: Aggregate durations by semantic group (using the first part of the ID)
	const groupDurations: Record<string, number> = {};

	recordedData.forEach((stroke) => {
		const groupId = stroke.id.split('-')[1]; // stroke-hill-1 -> hill
		const points = stroke.points;
		const duration = points.length > 0 ? points[points.length - 1].t : 1000;
		groupDurations[groupId] = (groupDurations[groupId] || 0) + duration;
	});

	// Pass 2: Calculate scale factors per group
	const groupScales: Record<string, number> = {};
	for (const [groupId, totalDuration] of Object.entries(groupDurations)) {
		groupScales[groupId] = totalDuration > 0 ? TARGET_DURATION_PER_COLOR / totalDuration : 1;
	}

	// Pass 3: Group strokes by semantic name
	const semanticGroups: Record<string, Stroke[]> = {};
	const groupOrder: string[] = [];

	recordedData.forEach((stroke) => {
		const groupId = stroke.id.split('-')[1];
		if (!semanticGroups[groupId]) {
			semanticGroups[groupId] = [];
			groupOrder.push(groupId);
		}
		semanticGroups[groupId].push(stroke);
	});

	// Pass 4: Generate Actions group by group
	groupOrder.forEach((groupId) => {
		const strokes = semanticGroups[groupId];
		const scale = groupScales[groupId];

		strokes.forEach((stroke) => {
			// Handle Color Change
			if (stroke.color !== currentColor) {
				actions.push({
					action: 'setBrushColor',
					params: { color: stroke.color },
					elementId: `tool-color-${stroke.color}`,
					duration: 400
				});
				actions.push({ action: 'delay', params: { ms: 200 } });
				currentColor = stroke.color;
			}

			// Draw the stroke
			const points = stroke.points;
			const originalDuration = points.length > 0 ? points[points.length - 1].t : 1000;

			actions.push({
				action: 'drawStroke',
				params: {
					id: stroke.id,
					path: points.map((p) => ({ x: p.x, y: p.y })),
					color: stroke.color,
					size: stroke.size,
					duration: originalDuration * scale,
					moveDuration: 400
				}
			});

			actions.push({ action: 'delay', params: { ms: delayBetweenStrokes } });
		});

		actions.push({ action: 'delay', params: { ms: 800 } });

		actions.push({ action: 'moveCursor', elementId: 'workspace-panel', duration: 400 });
		actions.push({ action: 'triggerAnalysis' });
		actions.push({ action: 'delay', params: { ms: 1500 } });

		if (groupId === 'zebra') {
			actions.push({ action: 'handleAskResponse', params: { response: 'yes' }, duration: 600 });
			actions.push({ action: 'delay', params: { ms: 2000 } });

			actions.push({ action: 'handleResultFeedback', params: { response: 'no' }, duration: 600 });
			actions.push({ action: 'delay', params: { ms: 1500 } });

			actions.push({ action: 'handleAskResponse', params: { response: 'yes' }, duration: 600 });
			actions.push({ action: 'delay', params: { ms: 2000 } });

			actions.push({ action: 'handleResultFeedback', params: { response: 'yes' }, duration: 600 });
			actions.push({ action: 'delay', params: { ms: 800 } });
		} else {
			actions.push({ action: 'handleAskResponse', params: { response: 'yes' }, duration: 600 });
			actions.push({ action: 'delay', params: { ms: 2000 } });

			actions.push({ action: 'handleResultFeedback', params: { response: 'yes' }, duration: 600 });
			actions.push({ action: 'delay', params: { ms: 800 } });
		}

		actions.push({ action: 'delay', params: { ms: 400 } });
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
