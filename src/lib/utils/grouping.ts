import { applyTransform, calculateBoundingBox } from '$lib/stores/canvas.svelte';
import type { Point, Stroke } from '$lib/types';

export type GroupingSettings = {
	groupingThreshold: number;
	idleTime: number;
};

type StrokeFeatures = {
	id: string;
	start: Point;
	end: Point;
	startTime: number;
	endTime: number;
	duration: number;
	center: Point;
	width: number;
	height: number;
	size: number;
	length: number;
	speed: number;
	brushSize: number;
	closedLoop: boolean;
};

export type GroupingResult = {
	strokeGroupMap: Map<string, string>;
	groups: Map<string, Set<string>>;
};

export const GROUPING_CONFIG = {
	weights: {
		temporal: 0.4,
		spatial: 0.35,
		geometry: 0.2,
		behavior: 0.05
	},
	// Larger values make slow/variable drawing speeds cluster more easily.
	speedTolerance: 2,
	lengthTolerance: 1.5,
	minTemporalTauMs: 1000,
	minSpatialRange: 40,
	spatialRangeScale: 0.5,
	brushRangeScale: 2,
	minClosedLoopDistance: 10,
	closedLoopCenterScale: 0.6,
	endpointThresholdScale: 1.5,
	minEndpointThreshold: 10,
	enclosurePortionThreshold: 0.6,
	enclosureRatioTarget: 0.2,
	enclosureRatioRange: 0.25,
	enclosureOuterAreaSoftCap: 60000,
	enclosureMaxScore: 0.85,
	highConfidenceThreshold: 0.85,
	highConfidenceScore: 0.95,
	temporalGate: 0.2,
	spatialGate: 0.4,
	geometryGate: 0.6
} as const;

function clamp01(value: number) {
	if (value <= 0) return 0;
	if (value >= 1) return 1;
	return value;
}

function distance(a: Point, b: Point) {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function boundsFromFeature(feature: StrokeFeatures) {
	const halfW = feature.width / 2;
	const halfH = feature.height / 2;
	return {
		minX: feature.center.x - halfW,
		minY: feature.center.y - halfH,
		maxX: feature.center.x + halfW,
		maxY: feature.center.y + halfH,
		area: Math.max(1, feature.width * feature.height)
	};
}

function enclosureScore(outer: StrokeFeatures, inner: StrokeFeatures) {
	const outerBounds = boundsFromFeature(outer);
	const innerBounds = boundsFromFeature(inner);

	const ix = Math.max(
		0,
		Math.min(outerBounds.maxX, innerBounds.maxX) - Math.max(outerBounds.minX, innerBounds.minX)
	);
	const iy = Math.max(
		0,
		Math.min(outerBounds.maxY, innerBounds.maxY) - Math.max(outerBounds.minY, innerBounds.minY)
	);
	const intersectionArea = ix * iy;
	const portion = intersectionArea / innerBounds.area;
	if (portion < GROUPING_CONFIG.enclosurePortionThreshold) return 0;

	const ratio = innerBounds.area / outerBounds.area;
	const ratioScore = clamp01(
		1 - Math.abs(ratio - GROUPING_CONFIG.enclosureRatioTarget) / GROUPING_CONFIG.enclosureRatioRange
	);
	const outerArea = outerBounds.area;
	const softCap = GROUPING_CONFIG.enclosureOuterAreaSoftCap;
	// Strongly penalize very large outer strokes while boosting small ones.
	const outerSizeScore = Math.pow(1 / (1 + outerArea / softCap), 1.5);
	const smallOuterBoost = clamp01(1 - outerArea / (softCap * 0.5));
	const outerPenalty = clamp01(1 - outerArea / (softCap * 2));
	const outerFactor = outerSizeScore * (0.6 + 0.4 * smallOuterBoost) * (0.5 + 0.5 * outerPenalty);

	const rawScore = portion * ratioScore * outerFactor;
	return clamp01(rawScore) * GROUPING_CONFIG.enclosureMaxScore;
}

function getTransformedPoints(stroke: Stroke) {
	const t = stroke.transform;
	if (!t || (t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0)) {
		return stroke.points;
	}
	return stroke.points.map((point) => applyTransform(point, t));
}

function computeStrokeFeatures(stroke: Stroke): StrokeFeatures | null {
	if (stroke.points.length === 0) return null;
	const points = getTransformedPoints(stroke);
	const start = points[0];
	const end = points[points.length - 1];
	const startTime = stroke.points[0].t;
	const endTime = stroke.points[stroke.points.length - 1].t;
	const duration = Math.max(1, endTime - startTime);

	let length = 0;
	for (let i = 1; i < points.length; i += 1) {
		length += distance(points[i - 1], points[i]);
	}

	const bounds = stroke.bounding ??
		calculateBoundingBox([stroke]) ?? {
			minX: start.x,
			minY: start.y,
			maxX: start.x,
			maxY: start.y,
			width: 0,
			height: 0,
			centerX: start.x,
			centerY: start.y
		};

	const width = Math.max(1, bounds.width);
	const height = Math.max(1, bounds.height);
	const size = Math.max(1, Math.hypot(width, height));
	const center = { x: bounds.centerX, y: bounds.centerY };
	const closedLoop =
		distance(start, end) <= Math.max(GROUPING_CONFIG.minClosedLoopDistance, stroke.size * 2);

	return {
		id: stroke.id,
		start,
		end,
		startTime,
		endTime,
		duration,
		center,
		width,
		height,
		size,
		length,
		speed: length / duration,
		brushSize: stroke.size,
		closedLoop
	};
}

function temporalScore(a: StrokeFeatures, b: StrokeFeatures, idleTime: number) {
	const delta = temporalDeltaMs(a, b);
	const tau = Math.max(GROUPING_CONFIG.minTemporalTauMs, idleTime * 1000);
	// Strongly prefer short gaps; longer gaps decay faster than linear.
	return Math.exp(-Math.pow(delta / tau, 1.35));
}

function temporalDeltaMs(a: StrokeFeatures, b: StrokeFeatures) {
	return Math.min(
		Math.abs(a.startTime - b.startTime),
		Math.abs(a.endTime - b.endTime),
		Math.abs(a.endTime - b.startTime),
		Math.abs(b.endTime - a.startTime)
	);
}

function spatialScore(a: StrokeFeatures, b: StrokeFeatures) {
	const dist = distance(a.center, b.center);
	const range = Math.max(
		GROUPING_CONFIG.minSpatialRange,
		(a.size + b.size) * GROUPING_CONFIG.spatialRangeScale +
			(a.brushSize + b.brushSize) * GROUPING_CONFIG.brushRangeScale
	);
	return clamp01(1 - dist / range);
}

function geometryScore(a: StrokeFeatures, b: StrokeFeatures) {
	const overlapX =
		Math.min(a.center.x + a.width / 2, b.center.x + b.width / 2) -
		Math.max(a.center.x - a.width / 2, b.center.x - b.width / 2);
	const overlapY =
		Math.min(a.center.y + a.height / 2, b.center.y + b.height / 2) -
		Math.max(a.center.y - a.height / 2, b.center.y - b.height / 2);
	const overlaps = overlapX > 0 && overlapY > 0;

	const endpointThreshold = Math.max(
		GROUPING_CONFIG.minEndpointThreshold,
		(a.brushSize + b.brushSize) * GROUPING_CONFIG.endpointThresholdScale
	);
	const endpointNear =
		distance(a.start, b.start) <= endpointThreshold ||
		distance(a.start, b.end) <= endpointThreshold ||
		distance(a.end, b.start) <= endpointThreshold ||
		distance(a.end, b.end) <= endpointThreshold;

	let score = 0;
	if (overlaps) score = Math.max(score, 0.6);
	if (endpointNear) score = Math.max(score, 0.9);
	if (
		a.closedLoop &&
		distance(a.center, b.center) <=
			Math.max(a.width, a.height) * GROUPING_CONFIG.closedLoopCenterScale
	) {
		score = Math.max(score, 0.7);
	}
	const enclosureAB = enclosureScore(a, b);
	const enclosureBA = enclosureScore(b, a);
	score = Math.max(score, enclosureAB, enclosureBA);
	return score;
}

function behaviorScore(a: StrokeFeatures, b: StrokeFeatures) {
	const speedMax = Math.max(a.speed, b.speed, 1e-3);
	const speedSim =
		1 - Math.min(1, Math.abs(a.speed - b.speed) / (speedMax * GROUPING_CONFIG.speedTolerance));
	const lengthMax = Math.max(a.length, b.length, 1);
	const lengthSim =
		1 - Math.min(1, Math.abs(a.length - b.length) / (lengthMax * GROUPING_CONFIG.lengthTolerance));
	return (speedSim + lengthSim) * 0.5;
}

function scorePair(a: StrokeFeatures, b: StrokeFeatures, settings: GroupingSettings) {
	const tScore = temporalScore(a, b, settings.idleTime);
	const sScore = spatialScore(a, b);
	const gScore = geometryScore(a, b);
	const bScore = behaviorScore(a, b);

	const highConfidence = Math.max(tScore, gScore);
	if (highConfidence >= GROUPING_CONFIG.highConfidenceThreshold) {
		const { temporal, spatial, geometry, behavior } = GROUPING_CONFIG.weights;
		const baseScore = temporal * tScore + spatial * sScore + geometry * gScore + behavior * bScore;
		return Math.max(GROUPING_CONFIG.highConfidenceScore, baseScore);
	}

	if (
		tScore < GROUPING_CONFIG.temporalGate &&
		sScore < GROUPING_CONFIG.spatialGate &&
		gScore < GROUPING_CONFIG.geometryGate
	) {
		return 0;
	}

	const { temporal, spatial, geometry, behavior } = GROUPING_CONFIG.weights;
	const baseScore = temporal * tScore + spatial * sScore + geometry * gScore + behavior * bScore;

	const delta = temporalDeltaMs(a, b);
	const tau = Math.max(GROUPING_CONFIG.minTemporalTauMs, settings.idleTime * 1000);
	const gapRatio = delta / tau;
	const temporalPenalty = gapRatio <= 1 ? 1 : 1 / Math.pow(gapRatio, 1.2);
	return baseScore * temporalPenalty;
}

export function computeGroups(strokes: Stroke[], settings: GroupingSettings): GroupingResult {
	const features = strokes
		.map((stroke) => computeStrokeFeatures(stroke))
		.filter((feature): feature is StrokeFeatures => feature !== null);

	const behaviorSummary = (() => {
		if (features.length === 0) {
			return {
				meanSpeed: 0,
				speedCv: 0,
				meanGapMs: 0,
				meanBrush: 0,
				meanLength: 0
			};
		}

		let sumSpeed = 0;
		let sumSpeedSq = 0;
		let sumBrush = 0;
		let sumLength = 0;
		for (const f of features) {
			sumSpeed += f.speed;
			sumSpeedSq += f.speed * f.speed;
			sumBrush += f.brushSize;
			sumLength += f.length;
		}
		const meanSpeed = sumSpeed / features.length;
		const variance = Math.max(0, sumSpeedSq / features.length - meanSpeed * meanSpeed);
		const speedStd = Math.sqrt(variance);
		const speedCv = meanSpeed > 1e-3 ? speedStd / meanSpeed : 0;

		const sortedByStart = [...features].sort((a, b) => a.startTime - b.startTime);
		let gapSum = 0;
		for (let i = 1; i < sortedByStart.length; i += 1) {
			const prev = sortedByStart[i - 1];
			const curr = sortedByStart[i];
			gapSum += Math.max(0, curr.startTime - prev.endTime);
		}
		const meanGapMs = sortedByStart.length > 1 ? gapSum / (sortedByStart.length - 1) : 0;

		return {
			meanSpeed,
			speedCv,
			meanGapMs,
			meanBrush: sumBrush / features.length,
			meanLength: sumLength / features.length
		};
	})();

	const behaviorFlow = (() => {
		if (features.length === 0) return 0;
		const gapNorm =
			settings.idleTime > 0 ? behaviorSummary.meanGapMs / (settings.idleTime * 1000) : 0;
		const gapScore = clamp01(1 - gapNorm / 1.5);
		const speedConsistency = clamp01(1 - Math.min(2, behaviorSummary.speedCv) / 2);
		return clamp01(0.6 * speedConsistency + 0.4 * gapScore);
	})();

	const dynamicIdleTime = settings.idleTime * (1 + 0.75 * (1 - behaviorFlow));
	const dynamicSettings: GroupingSettings = {
		...settings,
		idleTime: dynamicIdleTime
	};

	// Be more conservative: only a small reduction for smooth behavior.
	const behaviorThreshold = clamp01(settings.groupingThreshold - 0.05 * behaviorFlow);

	const idToIndex = new Map<string, number>();
	for (let i = 0; i < features.length; i += 1) {
		idToIndex.set(features[i].id, i);
	}

	const parent = new Array(features.length).fill(0).map((_, i) => i);

	const find = (i: number): number => {
		let curr = i;
		while (parent[curr] !== curr) {
			parent[curr] = parent[parent[curr]];
			curr = parent[curr];
		}
		return curr;
	};

	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[rb] = ra;
	};

	for (let i = 0; i < features.length; i += 1) {
		for (let j = i + 1; j < features.length; j += 1) {
			const a = features[i];
			const b = features[j];
			const score = scorePair(a, b, dynamicSettings);

			const tScore = temporalScore(a, b, dynamicSettings.idleTime);
			const sScore = spatialScore(a, b);
			const gScore = geometryScore(a, b);

			const affinity = (tScore + sScore) * 0.5;
			const adaptiveThreshold = Math.max(
				0.3,
				behaviorThreshold - 0.1 * affinity - 0.04 * behaviorFlow
			);

			const delta = temporalDeltaMs(a, b);
			const burstWindow =
				Math.max(GROUPING_CONFIG.minTemporalTauMs, dynamicSettings.idleTime * 1000) * 1.1;
			const burst = delta <= burstWindow && sScore >= 0.6 && (gScore >= 0.5 || sScore >= 0.75);

			if (score >= adaptiveThreshold || (burst && score >= behaviorThreshold * 0.85)) {
				union(i, j);
			}
		}
	}

	const groups = new Map<string, Set<string>>();
	for (let i = 0; i < features.length; i += 1) {
		const root = find(i);
		const groupId = `group_${root}`;
		const id = features[i].id;
		const group = groups.get(groupId) ?? new Set<string>();
		group.add(id);
		groups.set(groupId, group);
	}

	const strokeGroupMap = new Map<string, string>();
	for (const [groupId, ids] of groups) {
		for (const id of ids) {
			strokeGroupMap.set(id, groupId);
		}
	}

	// Ensure strokes without features still appear as singletons
	for (const stroke of strokes) {
		if (!strokeGroupMap.has(stroke.id)) {
			const groupId = `group_${stroke.id}`;
			strokeGroupMap.set(stroke.id, groupId);
			groups.set(groupId, new Set([stroke.id]));
		}
	}

	return { strokeGroupMap, groups };
}
