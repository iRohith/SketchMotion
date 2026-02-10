import type { DemoScenario, DemoAction } from './types';
import drawingData from '../assets/drawing.json';
import type { Stroke } from '$lib/types';

// Type assertion for the imported JSON
type RecordedData = Stroke[];

const recordedData = drawingData as unknown as RecordedData;

// Convert recorded actions to demo actions
function createScenarioFromRecording(): DemoAction[] {
	const actions: DemoAction[] = [];

	let currentColor = '';
	const delayBetweenStrokes = 100;
	const TARGET_DURATION_PER_COLOR = 3000;

	// --- Pre-compute group data ---

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

	const getIds = (id: string) => semanticGroups[id]?.map((s) => s.id) || [];
	const hillIds = getIds('hill');
	const sunIds = getIds('sun');
	const riverIds = getIds('river');
	const giraffeIds = getIds('giraffe');
	const zebraIds = getIds('zebra');

	// --- Helper: Add drawing strokes for a group ---

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
				actions.push({ action: 'delay', params: { ms: 150 } });
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
	};

	// ========================================================================
	// ACT 0 — INTRO
	// ========================================================================

	actions.push({ action: 'show' });
	actions.push({ action: 'delay', params: { ms: 400 } });

	actions.push({
		action: 'showNarration',
		params: {
			text: 'Welcome to SketchMotion — where AI understands your sketches in real-time ✨',
			duration: 3500,
			sound: 'typing'
		}
	});

	// ========================================================================
	// ACT 1 — HILLS  (draw + background narration)
	// ========================================================================

	actions.push({
		action: 'showNarrationAsync',
		params: {
			text: "Let's paint a landscape! Strokes are captured at 60fps with Catmull-Rom smoothing 🎯",
			duration: 3000,
			sound: 'typing'
		}
	});

	addStrokesForGroup('hill');

	if (hillIds.length > 0) {
		actions.push({
			action: 'showManualAskHover',
			params: { groupId: 'hill', strokeIds: hillIds }
		});
		// Quick flash — hill is recognized but we move on
		actions.push({ action: 'delay', params: { ms: 300 } });
	}

	// ========================================================================
	// ACT 2 — SUN  (draw + first full analysis showcase)
	// ========================================================================

	actions.push({
		action: 'showNarrationAsync',
		params: {
			text: 'Adding a sun! The Smart Grouping Engine clusters strokes by color, time, and proximity 📐',
			duration: 3500,
			sound: 'typing'
		}
	});

	addStrokesForGroup('sun');

	if (sunIds.length > 0) {
		// Full analysis cycle — event-driven (awaits API internally)
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'sun', strokeIds: sunIds }
		});

		// Narration while result is visible
		actions.push({
			action: 'showNarration',
			params: {
				text: 'Dual-view analysis: intent image (bright) + context image (dim) sent to Gemini ⚡',
				duration: 3000,
				sound: 'typing'
			}
		});

		// Confirm — cursor moves to Yes and clicks
		actions.push({
			action: 'handleResultFeedback',
			params: { response: 'yes' },
			duration: 600
		});
		actions.push({ action: 'delay', params: { ms: 300 } });
	}

	// ========================================================================
	// ACT 3 — RIVER  (draw + quick confirm)
	// ========================================================================

	actions.push({
		action: 'showNarrationAsync',
		params: {
			text: 'A river flowing through! Each verified object is locked into the context graph 🔒',
			duration: 3000,
			sound: 'typing'
		}
	});

	addStrokesForGroup('river');

	if (riverIds.length > 0) {
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'river', strokeIds: riverIds }
		});

		// Quick confirm
		actions.push({ action: 'delay', params: { ms: 300 } });
		actions.push({
			action: 'handleResultFeedback',
			params: { response: 'yes' },
			duration: 600
		});
		actions.push({ action: 'delay', params: { ms: 300 } });
	}

	// ========================================================================
	// ACT 4 — GIRAFFE  (draw + confirm + recreate tease)
	// ========================================================================

	actions.push({
		action: 'showNarrationAsync',
		params: {
			text: 'Now a giraffe — spatial containment groups spots + body + neck together 🦒',
			duration: 3500,
			sound: 'typing'
		}
	});

	addStrokesForGroup('giraffe');

	if (giraffeIds.length > 0) {
		actions.push({
			action: 'performFullManualAnalysis',
			params: { groupId: 'giraffe', strokeIds: giraffeIds }
		});

		actions.push({
			action: 'handleResultFeedback',
			params: { response: 'yes' },
			duration: 600
		});
		actions.push({ action: 'delay', params: { ms: 300 } });

		actions.push({
			action: 'showNarration',
			params: {
				text: 'Passing to Gemini Image Generation for hi-fi asset creation… 🎨',
				duration: 2500,
				sound: 'typing'
			}
		});

		// Demonstrate image recreation via API
		actions.push({
			action: 'triggerRecreate',
			params: { groupId: 'giraffe' }
		});

		actions.push({ action: 'delay', params: { ms: 500 } });

		actions.push({
			action: 'showNarration',
			params: {
				text: 'Sketch replaced with a hi-fi asset — all in real-time, right on the canvas! 🖼️✨',
				duration: 3500,
				sound: 'typing'
			}
		});
	}

	// ========================================================================
	// OUTRO
	// ========================================================================

	actions.push({
		action: 'showNarration',
		params: {
			text: "That's SketchMotion — sketch, analyze, generate, all powered by Gemini 🚀",
			duration: 3500,
			sound: 'typing'
		}
	});

	actions.push({ action: 'delay', params: { ms: 500 } });
	actions.push({ action: 'stopDemo', elementId: 'demo-button', duration: 1000 });

	return actions;
}

export const recordedDemo: DemoScenario = {
	name: 'Recorded Demo',
	description: 'Replay of recorded session from assets/drawing.json',
	actions: createScenarioFromRecording()
};
