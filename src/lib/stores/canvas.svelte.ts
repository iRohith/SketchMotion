import type { BoundingBox, Point, Stroke, Transform } from '$lib/types';
import { SvelteMap } from 'svelte/reactivity';
import { moveCursorToElement, type CursorOptions } from './demoCursor.svelte';
import { canvasToolbarState } from './canvasToolbar.svelte';
import { computeGroups, type GroupingSettings } from '$lib/utils/grouping';
import { pushStrokeHistory, undoStrokeHistory, redoStrokeHistory } from './history.svelte';

export const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const strokes = new SvelteMap<string, Stroke>();
export const strokeGroupMap = new SvelteMap<string, string>();
export const groups = new SvelteMap<string, Set<string>>();
export const renderPendingStore = $state({ renderPending: false });

export const groupingSettings = $state<GroupingSettings>({
	groupingThreshold: 0.5,
	idleTime: 1.5
});

function applyStrokeSnapshot(snapshot: Stroke[]) {
	strokes.clear();
	for (const stroke of snapshot) {
		strokes.set(stroke.id, stroke);
	}
	canvasToolbarState.selectedIds = [];
	recomputeGroups();
	requestRender();
}

export function commitStrokeHistory() {
	pushStrokeHistory(strokes.values());
}

export function undoStrokes() {
	undoStrokeHistory(applyStrokeSnapshot);
}

export function redoStrokes() {
	redoStrokeHistory(applyStrokeSnapshot);
}

let groupRecomputeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleGroupRecompute() {
	if (groupRecomputeTimer) {
		clearTimeout(groupRecomputeTimer);
	}
	groupRecomputeTimer = setTimeout(() => {
		groupRecomputeTimer = null;
		recomputeGroups();
	}, 600);
}

export function addStroke(stroke: Stroke) {
	strokes.set(stroke.id, stroke);
	scheduleGroupRecompute();
}

export function updateStroke(stroke: Stroke) {
	strokes.set(stroke.id, stroke);
	scheduleGroupRecompute();
}

export function deleteStroke(strokeId: string) {
	strokes.delete(strokeId);
	scheduleGroupRecompute();
}

export function requestRender() {
	renderPendingStore.renderPending = true;
}

export function deleteSelectedStrokes(elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			canvasToolbarState.selectedIds.forEach((id) => {
				strokes.delete(id);
			});
			canvasToolbarState.selectedIds = [];
			scheduleGroupRecompute();
			commitStrokeHistory();
			requestRender();
		},
		...options
	});
}

export function deleteAllStrokes(elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			strokes.clear();
			strokeGroupMap.clear();
			groups.clear();
			canvasToolbarState.selectedIds = [];
			commitStrokeHistory();
			requestRender();
		},
		...options
	});
}

export function applyTransform(point: Point, t: Transform): Point {
	return {
		x: point.x * t.a + point.y * t.c + t.e,
		y: point.x * t.b + point.y * t.d + t.f
	};
}

export function multiplyTransform(a: Transform, b: Transform): Transform {
	return {
		a: a.a * b.a + a.c * b.b,
		b: a.b * b.a + a.d * b.b,
		c: a.a * b.c + a.c * b.d,
		d: a.b * b.c + a.d * b.d,
		e: a.a * b.e + a.c * b.f + a.e,
		f: a.b * b.e + a.d * b.f + a.f
	};
}

export function invertTransform(t: Transform): Transform | null {
	const det = t.a * t.d - t.b * t.c;
	if (!det) return null;
	const inv = 1 / det;
	return {
		a: t.d * inv,
		b: -t.b * inv,
		c: -t.c * inv,
		d: t.a * inv,
		e: (t.c * t.f - t.d * t.e) * inv,
		f: (t.b * t.e - t.a * t.f) * inv
	};
}

export function calculateBoundingBox(strokes: Stroke[]): BoundingBox | null {
	if (strokes.length === 0) return null;

	let minX = Infinity,
		minY = Infinity;
	let maxX = -Infinity,
		maxY = -Infinity;

	// Calculate axis-aligned bounds from transformed points
	let maxScale = 1;
	strokes.forEach((stroke) => {
		const t = stroke.transform ?? IDENTITY;
		const scale = Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d));
		if (scale > maxScale) maxScale = scale;
		stroke.points.forEach((point) => {
			const tp = applyTransform(point, t);
			minX = Math.min(minX, tp.x);
			minY = Math.min(minY, tp.y);
			maxX = Math.max(maxX, tp.x);
			maxY = Math.max(maxY, tp.y);
		});
	});

	// Add padding for brush size
	const maxBrushSize = Math.max(...strokes.map((s) => s.size));
	const padding = (maxBrushSize * maxScale) / 2;

	return {
		minX: minX - padding,
		minY: minY - padding,
		maxX: maxX + padding,
		maxY: maxY + padding,
		width: maxX - minX + 2 * padding,
		height: maxY - minY + 2 * padding,
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2
	};
}

export function isPointOnStroke(point: Point, stroke: Stroke) {
	const bounds = stroke.bounding;
	if (bounds) {
		if (
			point.x < bounds.minX ||
			point.x > bounds.maxX ||
			point.y < bounds.minY ||
			point.y > bounds.maxY
		) {
			return false;
		}
	}

	const points = stroke.points;
	if (points.length === 0) return false;

	const inv = stroke.transform ? invertTransform(stroke.transform) : null;
	const local = inv ? applyTransform(point, inv) : point;

	const radius = stroke.size / 2 + 2;
	const radiusSq = radius * radius;

	if (points.length === 1) {
		const dx = local.x - points[0].x;
		const dy = local.y - points[0].y;
		return dx * dx + dy * dy <= radiusSq;
	}

	const step = Math.max(1, Math.ceil(points.length / 64));
	for (let i = 0; i < points.length - 1; i += step) {
		const a = points[i];
		const b = points[Math.min(i + step, points.length - 1)];

		const abx = b.x - a.x;
		const aby = b.y - a.y;
		const apx = local.x - a.x;
		const apy = local.y - a.y;

		const abLenSq = abx * abx + aby * aby;
		let t = 0;
		if (abLenSq > 0) {
			t = (apx * abx + apy * aby) / abLenSq;
			t = Math.max(0, Math.min(1, t));
		}

		const closestX = a.x + abx * t;
		const closestY = a.y + aby * t;
		const dx = local.x - closestX;
		const dy = local.y - closestY;

		if (dx * dx + dy * dy <= radiusSq) return true;
	}

	return false;
}

export function recomputeGroups() {
	const strokeArray = Array.from(strokes.values()).filter(
		(stroke) => stroke.layer === canvasToolbarState.activeLayer
	);
	const result = computeGroups(strokeArray, groupingSettings);

	strokeGroupMap.clear();
	groups.clear();

	for (const [strokeId, groupId] of result.strokeGroupMap) {
		strokeGroupMap.set(strokeId, groupId);
	}
	for (const [groupId, strokeIds] of result.groups) {
		groups.set(groupId, strokeIds);
	}
}

export function getGroupIdForStroke(strokeId: string): string | undefined {
	return strokeGroupMap.get(strokeId);
}

export function getStrokeIdsInGroup(groupId: string): string[] {
	const strokeIds = groups.get(groupId);
	return strokeIds ? Array.from(strokeIds) : [];
}

export function getGroupMembersForStroke(strokeId: string): string[] {
	const groupId = strokeGroupMap.get(strokeId);
	if (!groupId) return [strokeId];
	return getStrokeIdsInGroup(groupId);
}

export function selectGroup(strokeId: string, addToSelection: boolean = false) {
	const memberIds = getGroupMembersForStroke(strokeId);
	if (addToSelection) {
		const current = new Set(canvasToolbarState.selectedIds);
		const allSelected = memberIds.every((id) => current.has(id));
		if (allSelected) {
			memberIds.forEach((id) => current.delete(id));
		} else {
			memberIds.forEach((id) => current.add(id));
		}
		canvasToolbarState.selectedIds = Array.from(current);
	} else {
		canvasToolbarState.selectedIds = memberIds;
	}
}

export function getHoveredGroupIds(): string[] {
	const hoveredId = canvasToolbarState.hoveredStrokeId;
	if (!hoveredId) return [];
	if (!canvasToolbarState.groupSelect) return [hoveredId];
	return getGroupMembersForStroke(hoveredId);
}
