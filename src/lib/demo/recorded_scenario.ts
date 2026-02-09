import type { DemoScenario, DemoAction } from './types';
import drawingData from '../assets/drawing.json';
import type { Stroke } from '$lib/types';

// Type assertion for the imported JSON
type RecordedData = Stroke[];

const recordedData = drawingData as unknown as RecordedData;

// Convert recorded actions to demo actions
function createScenarioFromRecording(): DemoAction[] {
	const actions: DemoAction[] = [
		{ action: 'show' },
		{ action: 'delay', params: { ms: 500 } },
		{
			action: 'showNarration',
			params: {
				text: 'Welcome to SketchMotion! Watch as AI understands your drawings in real-time ✨',
				duration: 4000,
				sound: 'typing'
			}
		}
	];

	let currentColor = '';
	const delayBetweenStrokes = 200;
	const TARGET_DURATION_PER_COLOR = 3000;

	const groupDurations: Record<string, number> = {};

	recordedData.forEach((stroke) => {
		const groupId = stroke.id.split('-')[1];
		const points = stroke.points;
		const duration = points.length > 0 ? points[points.length - 1].t : 1000;
		groupDurations[groupId] = (groupDurations[groupId] || 0) + duration;
	});

	const groupScales: Record<string, number> = {};
	for (const [groupId, totalDuration] of Object.entries(groupDurations)) {
		groupScales[groupId] = totalDuration > 0 ? TARGET_DURATION_PER_COLOR / totalDuration : 1;
	}

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

	const addStrokesForGroup = (groupId: string) => {
		const strokes = semanticGroups[groupId];
		if (!strokes) return;

		const scale = groupScales[groupId];

		strokes.forEach((stroke) => {
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
	};

	// Helper to add IDs
	const getIds = (id: string) => semanticGroups[id]?.map((s) => s.id) || [];

	const hillIds = getIds('hill');
	const sunIds = getIds('sun');
	const riverIds = getIds('river');
	const giraffeIds = getIds('giraffe');
	const zebraIds = getIds('zebra');

	// --- 1. Hill ---
	addStrokesForGroup('hill');

	if (hillIds.length > 0) {
		actions.push({
			action: 'showManualAskHover',
			params: { groupId: 'hill', strokeIds: hillIds }
		});
		actions.push({ action: 'delay', params: { ms: 50 } });
	}

	// --- 2. Sun ---
	addStrokesForGroup('sun');

	if (sunIds.length > 0) {
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'sun', strokeIds: sunIds }
		});

		// Wait for Result Hover to appear and be ready
		actions.push({ action: 'delay', params: { ms: 1500 } });

		const sunAnalysisDuration = 3000;
		actions.push({
			action: 'showNarration',
			params: {
				text: 'Analyzing the scene context... 🧠',
				duration: sunAnalysisDuration,
				sound: 'typing'
			}
		});

		actions.push({ action: 'playSound', params: { sound: 'click' } });
		actions.push({ action: 'handleResultFeedback', params: { response: 'yes' }, duration: 600 });
		actions.push({ action: 'delay', params: { ms: 400 } });
	}

	// --- 3. River ---
	addStrokesForGroup('river');

	if (riverIds.length > 0) {
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'river', strokeIds: riverIds }
		});

		// Wait for Result Hover to appear and be ready
		actions.push({ action: 'delay', params: { ms: 1500 } });

		actions.push({ action: 'playSound', params: { sound: 'click' } });
		actions.push({ action: 'handleResultFeedback', params: { response: 'yes' }, duration: 600 });
		actions.push({ action: 'delay', params: { ms: 400 } });
	}

	// --- 4. Giraffe ---
	addStrokesForGroup('giraffe');

	if (giraffeIds.length > 0) {
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'giraffe', strokeIds: giraffeIds }
		});

		// Wait for Result Hover to appear and be ready
		actions.push({ action: 'delay', params: { ms: 1500 } });

		actions.push({ action: 'playSound', params: { sound: 'click' } });
		actions.push({ action: 'handleResultFeedback', params: { response: 'yes' }, duration: 600 });
		actions.push({ action: 'delay', params: { ms: 1000 } });

		const giraffeRecreateDuration = 2500;
		actions.push({
			action: 'showNarration',
			params: {
				text: 'Generating high-fidelity asset... 🎨',
				duration: giraffeRecreateDuration,
				sound: 'typing'
			}
		});
	}

	// --- 5. Zebra ---
	addStrokesForGroup('zebra');

	if (zebraIds.length > 0) {
		// First pass (Horse)
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'zebra', strokeIds: zebraIds }
		});

		// Wait for Result Hover to appear and be ready
		actions.push({ action: 'delay', params: { ms: 1500 } });

		actions.push({ action: 'playSound', params: { sound: 'click' } });
		actions.push({ action: 'handleResultFeedback', params: { response: 'no' }, duration: 600 });
		actions.push({ action: 'delay', params: { ms: 1000 } });

		const zebraFeedbackDuration = 2500;
		actions.push({
			action: 'showNarration',
			params: {
				text: 'Refining context with feedback... ✍️',
				duration: zebraFeedbackDuration,
				sound: 'typing'
			}
		});

		// Retry (Zebra -> Yes)
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'zebra', strokeIds: zebraIds, isRetry: true }
		});

		// Wait for Result Hover to appear and be ready
		actions.push({ action: 'delay', params: { ms: 1500 } });

		actions.push({ action: 'playSound', params: { sound: 'click' } });
		actions.push({ action: 'handleResultFeedback', params: { response: 'yes' }, duration: 600 });
		actions.push({ action: 'delay', params: { ms: 400 } });
	}

	actions.push({ action: 'delay', params: { ms: 1000 } });
	actions.push({ action: 'stopDemo', elementId: 'demo-button', duration: 1000 });

	return actions;
}

export const recordedDemo: DemoScenario = {
	name: 'Recorded Demo',
	description: 'Replay of recorded session from assets/drawing.json',
	actions: createScenarioFromRecording()
};
