import type { Point, Stroke, StrokePoint } from '$lib/types';
import { demoCursor } from '$lib/stores/demoCursor.svelte';
import {
	requestRender,
	addStroke,
	updateStroke,
	calculateBoundingBox,
	commitStrokeHistory
} from '$lib/stores/canvas.svelte';
import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './constants';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const strokeTuning = {
	smoothingStrength: 0.8,
	cornerAngleThreshold: 1.15,
	slowSpeed: 0.01,
	fastSpeed: 0.1
};

function isCornerPoint(points: StrokePoint[], index: number, angleThreshold: number): boolean {
	if (index <= 0 || index >= points.length - 1) return true;
	const prev = points[index - 1];
	const curr = points[index];
	const next = points[index + 1];
	const v1x = curr.x - prev.x;
	const v1y = curr.y - prev.y;
	const v2x = next.x - curr.x;
	const v2y = next.y - curr.y;
	const mag1 = Math.hypot(v1x, v1y);
	const mag2 = Math.hypot(v2x, v2y);
	if (mag1 === 0 || mag2 === 0) return true;
	const cosAngle = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
	const angle = Math.acos(cosAngle);
	return angle > angleThreshold;
}

function reduceStroke(points: StrokePoint[]): StrokePoint[] {
	if (points.length < 3) return points;
	const { smoothingStrength, cornerAngleThreshold, slowSpeed, fastSpeed } = strokeTuning;
	const minSpacing = 0.3 + smoothingStrength * 2.5;
	const maxSpacing = 1.2 + smoothingStrength * 10.0;

	const reduced: StrokePoint[] = [points[0]];
	for (let i = 1; i < points.length - 1; i += 1) {
		const curr = points[i];
		if (isCornerPoint(points, i, cornerAngleThreshold)) {
			reduced.push(curr);
			continue;
		}
		const prev = reduced[reduced.length - 1];
		const dx = curr.x - prev.x;
		const dy = curr.y - prev.y;
		const dist = Math.hypot(dx, dy);
		const dt = Math.max(1, curr.t - prev.t);
		const speed = dist / dt;
		const normalized = Math.min(1, Math.max(0, (speed - slowSpeed) / (fastSpeed - slowSpeed)));
		const targetSpacing = minSpacing + (maxSpacing - minSpacing) * normalized;
		if (dist < targetSpacing) continue;
		reduced.push(curr);
	}
	reduced.push(points[points.length - 1]);
	return reduced;
}

function computeCorners(points: StrokePoint[], angleThreshold: number): boolean[] {
	if (points.length === 0) return [];
	const corners = new Array(points.length).fill(false);
	corners[0] = true;
	corners[points.length - 1] = true;
	for (let i = 1; i < points.length - 1; i += 1) {
		corners[i] = isCornerPoint(points, i, angleThreshold);
	}
	return corners;
}

function finalizeStroke(stroke: Stroke): void {
	stroke.points = reduceStroke(stroke.points);
	stroke.bounding = calculateBoundingBox([stroke]) ?? undefined;
	stroke.corners = computeCorners(stroke.points, strokeTuning.cornerAngleThreshold);
}

function getCanvasFitElement(): HTMLDivElement | null {
	return document.querySelector('.canvas-fit') as HTMLDivElement | null;
}

export function canvasToScreen(canvasPoint: Point): Point | null {
	const fitEl = getCanvasFitElement();
	if (!fitEl) return null;

	const rect = fitEl.getBoundingClientRect();
	const scaleX = rect.width / CANVAS_WIDTH;
	const scaleY = rect.height / CANVAS_HEIGHT;

	return {
		x: rect.left + canvasPoint.x * scaleX,
		y: rect.top + canvasPoint.y * scaleY
	};
}

function createStrokeId(): string {
	return `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getPointOnPath(path: Point[], t: number): Point {
	if (path.length === 0) return { x: 0, y: 0 };
	if (path.length === 1) return path[0];

	let totalLen = 0;
	const dists: number[] = [];
	for (let i = 0; i < path.length - 1; i++) {
		const dx = path[i + 1].x - path[i].x;
		const dy = path[i + 1].y - path[i].y;
		const d = Math.sqrt(dx * dx + dy * dy);
		dists.push(d);
		totalLen += d;
	}

	if (totalLen === 0) return path[path.length - 1];

	const targetDist = totalLen * t;
	let currentDist = 0;

	for (let i = 0; i < dists.length; i++) {
		if (currentDist + dists[i] >= targetDist) {
			const segmentT = dists[i] > 0 ? (targetDist - currentDist) / dists[i] : 0;
			const p1 = path[i];
			const p2 = path[i + 1];
			return {
				x: p1.x + (p2.x - p1.x) * segmentT,
				y: p1.y + (p2.y - p1.y) * segmentT
			};
		}
		currentDist += dists[i];
	}

	return path[path.length - 1];
}

export interface DemoStrokeOptions {
	duration?: number;
	moveDuration?: number;
	ease?: (t: number) => number;
	color?: string;
	size?: number;
	onComplete?: () => void;
}

function animateCanvasPath(
	canvasPath: Point[],
	duration: number,
	ease: (t: number) => number,
	onUpdate: (canvasPoint: Point, screenPoint: Point | null) => void
): Promise<void> {
	return new Promise((resolve) => {
		const startTime = performance.now();
		let rafId: number;

		function loop() {
			if (!demoCursor.visible) {
				cancelAnimationFrame(rafId);
				resolve();
				return;
			}

			const elapsed = performance.now() - startTime;
			const t = Math.min(1, elapsed / duration);
			const easedT = ease(t);

			const canvasPoint = getPointOnPath(canvasPath, easedT);
			const screenPoint = canvasToScreen(canvasPoint);

			onUpdate(canvasPoint, screenPoint);

			if (t < 1) {
				rafId = requestAnimationFrame(loop);
			} else {
				resolve();
			}
		}

		rafId = requestAnimationFrame(loop);
	});
}

export async function drawDemoStroke(
	canvasPath: Point[],
	options: DemoStrokeOptions = {}
): Promise<void> {
	if (canvasPath.length === 0) return;
	if (!demoCursor.visible) {
		options.onComplete?.();
		return;
	}

	const ease = options.ease ?? easeOutCubic;
	const moveDuration = options.moveDuration ?? 300;
	const drawDuration = options.duration ?? 1000;

	// Phase 1: Move cursor to start position (no drawing)
	// For the move phase, we animate the cursor in screen space to the start point
	const startScreenPoint = canvasToScreen(canvasPath[0]);
	if (startScreenPoint) {
		const startX = demoCursor.x;
		const startY = demoCursor.y;
		const endX = startScreenPoint.x;
		const endY = startScreenPoint.y;

		await new Promise<void>((resolve) => {
			const startTime = performance.now();
			let rafId: number;

			function moveLoop() {
				if (!demoCursor.visible) {
					cancelAnimationFrame(rafId);
					resolve();
					return;
				}

				const elapsed = performance.now() - startTime;
				const t = Math.min(1, elapsed / moveDuration);
				const easedT = ease(t);

				demoCursor.x = startX + (endX - startX) * easedT;
				demoCursor.y = startY + (endY - startY) * easedT;

				if (t < 1) {
					rafId = requestAnimationFrame(moveLoop);
				} else {
					resolve();
				}
			}

			rafId = requestAnimationFrame(moveLoop);
		});
	}

	if (!demoCursor.visible) {
		options.onComplete?.();
		return;
	}

	// Phase 2: Draw the stroke
	const stroke: Stroke = {
		id: createStrokeId(),
		points: [{ x: canvasPath[0].x, y: canvasPath[0].y, t: 0 }],
		color: options.color ?? canvasToolbarState.brushColor,
		size: options.size ?? canvasToolbarState.brushSize,
		layer: canvasToolbarState.activeLayer
	};

	addStroke(stroke);
	requestRender();

	const drawStartTime = performance.now();
	demoCursor.clicking = true;
	demoCursor.dragging = true;

	await animateCanvasPath(canvasPath, drawDuration, ease, (canvasPoint, screenPoint) => {
		// Update cursor position (converts fresh on each frame)
		if (screenPoint) {
			demoCursor.x = screenPoint.x;
			demoCursor.y = screenPoint.y;
		}

		// Add point using canvas coordinates directly
		stroke.points.push({
			x: canvasPoint.x,
			y: canvasPoint.y,
			t: performance.now() - drawStartTime
		});
		requestRender();
	});

	demoCursor.clicking = false;
	demoCursor.dragging = false;

	finalizeStroke(stroke);
	updateStroke(stroke);
	commitStrokeHistory();
	requestRender();
	options.onComplete?.();
}

export async function drawDemoStrokes(
	strokePaths: { path: Point[]; options?: DemoStrokeOptions }[],
	delayBetween: number = 300
): Promise<void> {
	for (let i = 0; i < strokePaths.length; i++) {
		const { path, options } = strokePaths[i];
		await drawDemoStroke(path, options);
		if (i < strokePaths.length - 1 && delayBetween > 0) {
			await new Promise((r) => setTimeout(r, delayBetween));
		}
	}
}
