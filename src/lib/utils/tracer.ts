import type { Stroke } from '$lib/types';
import { createStrokeId } from './demoStroke';
import { calculateBoundingBox } from '$lib/stores/canvas.svelte';
import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';

interface TracerOptions {
	scale?: number;
	smoothing?: number;
	threshold?: number; // Alpha threshold
	color?: string;
}

// Simple implementation of Marching Squares for contour tracing
export async function traceImage(
	imageUrl: string,
	originalStrokes: Stroke[] = [],
	options: TracerOptions = {}
): Promise<Stroke[]> {
	const threshold = options.threshold ?? 128;
	const traceColor = options.color ?? '#000000';

	// 1. Load image
	const img = await loadImage(imageUrl);
	const width = img.width;
	const height = img.height;

	// 2. Draw to canvas to get data
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, 0, 0);
	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;

	// 3. Grid for Marching Squares
	const getVal = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= width || y >= height) return 0;
		const idx = (y * width + x) * 4;
		const r = data[idx];
		const g = data[idx + 1];
		const b = data[idx + 2];
		const a = data[idx + 3];
		const brightness = (r + g + b) / 3;
		// If transparent, it's outside. If opaque and dark, it's inside.
		return a > 50 && brightness < threshold ? 1 : 0;
	};

	// 4. Marching Squares Algorithm
	const visited = new Set<string>();
	const contours: Stroke[] = [];
	const step = 2;

	for (let y = 0; y < height; y += step) {
		for (let x = 0; x < width; x += step) {
			if (getVal(x, y) === 1 && !visited.has(`${x},${y}`)) {
				const path = traceBoundary(x, y, getVal, visited, width, height);
				if (path.length > 10) {
					const simplified = simplifyPath(path, 2);
					const strokePoints = simplified.map((p) => ({
						x: p.x,
						y: p.y,
						t: Date.now()
					}));

					if (strokePoints.length > 2) {
						const stroke: Stroke = {
							id: createStrokeId(),
							points: strokePoints,
							color: traceColor,
							size: 2,
							layer: canvasToolbarState.activeLayer
						};
						stroke.bounding = calculateBoundingBox([stroke]) ?? undefined;
						contours.push(stroke);
					}
				}
			}
		}
	}

	// 5. Second Pass: Convert outlines to thick regular strokes
	return refineStrokes(contours, originalStrokes);
}

function refineStrokes(contours: Stroke[], originalStrokes: Stroke[]): Stroke[] {
	if (originalStrokes.length === 0) return contours;

	const refined: Stroke[] = [];
	const usedOriginals = new Set<string>();

	for (const contour of contours) {
		const bestMatch = findBestMatch(contour, originalStrokes, usedOriginals);

		if (bestMatch) {
			usedOriginals.add(bestMatch.id);
			// Morph the original stroke to fit the contour
			const morphed = morphStroke(bestMatch, contour);
			refined.push(morphed);
		} else {
			// No match found - keep outline?
			// Or maybe the contour IS the stroke (if thin enough)?
			// For now, let's keep it but mark it?
			// The user said "conversion", implying we prefer single strokes.
			// But if we can't find a guide, the contour is the best we have.
			refined.push(contour);
		}
	}

	return refined;
}

function findBestMatch(contour: Stroke, candidates: Stroke[], exclude: Set<string>): Stroke | null {
	if (!contour.bounding) return null;
	const cBox = contour.bounding;
	let best: Stroke | null = null;
	let maxScore = 0;

	for (const cand of candidates) {
		if (exclude.has(cand.id)) continue;
		if (!cand.bounding) continue;
		const sBox = cand.bounding;

		// Quick bbox check
		if (
			sBox.maxX < cBox.minX ||
			sBox.minX > cBox.maxX ||
			sBox.maxY < cBox.minY ||
			sBox.minY > cBox.maxY
		)
			continue;

		// Detailed overlap check
		const score = calculateOverlap(cand, contour);
		if (score > maxScore && score > 0.3) {
			// Threshold 30% overlap
			maxScore = score;
			best = cand;
		}
	}

	return best;
}

function calculateOverlap(stroke: Stroke, contour: Stroke): number {
	// Intersection over Union (IoU) of points is hard for strokes.
	// Instead, let's check how many points of 'stroke' are inside 'contour'.
	let insideCount = 0;
	let totalCount = 0;
	const step = Math.max(1, Math.floor(stroke.points.length / 20));

	for (let i = 0; i < stroke.points.length; i += step) {
		totalCount++;
		if (pointInPolygon(stroke.points[i], contour.points)) {
			insideCount++;
		}
	}

	return totalCount > 0 ? insideCount / totalCount : 0;
}

function pointInPolygon(p: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x,
			yi = polygon[i].y;
		const xj = polygon[j].x,
			yj = polygon[j].y;
		const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function morphStroke(original: Stroke, contour: Stroke): Stroke {
	// 1. Calculate average width of the contour
	//    Area approx = polygon area. Length approx = perimeter / 2?
	//    Or better: area / original length
	const area = polygonArea(contour.points);
	const length = strokeLength(original.points);
	const estimatedThickness = length > 0 ? Math.max(2, area / length) : original.size;

	// 2. Center-alignment (Simple approach)
	//    We keep the original points but could relax them towards the contour centroid?
	//    Actually, if the AI fixed the shape, we WANT to move the points.
	//    Let's clamp the original points to be strictly inside the contour.
	const newPoints = original.points.map((p) => {
		if (pointInPolygon(p, contour.points)) return { ...p };

		// If outside, find nearest point on contour and move slightly inside
		const nearest = findNearestPointOnPoly(p, contour.points);
		// Move 90% towards nearest (snap to edge)
		return {
			x: p.x + (nearest.x - p.x) * 0.9,
			y: p.y + (nearest.y - p.y) * 0.9,
			t: p.t
		};
	});

	return {
		...original,
		id: createStrokeId(),
		points: newPoints,
		size: estimatedThickness * 0.8, // Adjust scale slightly
		// Use original color
		color: original.color
	};
}

function polygonArea(points: { x: number; y: number }[]): number {
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const j = (i + 1) % points.length;
		area += points[i].x * points[j].y;
		area -= points[j].x * points[i].y;
	}
	return Math.abs(area) / 2;
}

function strokeLength(points: { x: number; y: number }[]): number {
	let len = 0;
	for (let i = 0; i < points.length - 1; i++) {
		len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
	}
	return len;
}

function findNearestPointOnPoly(
	p: { x: number; y: number },
	poly: { x: number; y: number }[]
): { x: number; y: number } {
	let minDst = Infinity;
	let nearest = p;

	for (let i = 0; i < poly.length; i++) {
		const p1 = poly[i];
		const p2 = poly[(i + 1) % poly.length];
		const proj = projectPointOnSegment(p, p1, p2);
		const dst = Math.hypot(p.x - proj.x, p.y - proj.y);
		if (dst < minDst) {
			minDst = dst;
			nearest = proj;
		}
	}
	return nearest;
}

function projectPointOnSegment(
	p: { x: number; y: number },
	a: { x: number; y: number },
	b: { x: number; y: number }
) {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const apx = p.x - a.x;
	const apy = p.y - a.y;
	const len2 = abx * abx + aby * aby;
	if (len2 === 0) return a;
	let t = (apx * abx + apy * aby) / len2;
	t = Math.max(0, Math.min(1, t));
	return { x: a.x + t * abx, y: a.y + t * aby };
}

function traceBoundary(
	startX: number,
	startY: number,
	getVal: (x: number, y: number) => number,
	visited: Set<string>,
	w: number,
	h: number
) {
	const path: { x: number; y: number }[] = [];
	let cx = startX;
	let cy = startY;

	// Moore-Neighbor Tracing
	// Directions: N, NE, E, SE, S, SW, W, NW
	const dx = [0, 1, 1, 1, 0, -1, -1, -1];
	const dy = [-1, -1, 0, 1, 1, 1, 0, -1];
	let backtrack = 4; // Start coming from South

	// Limit to avoid infinite loops
	let maxSteps = w * h;

	path.push({ x: cx, y: cy });
	visited.add(`${cx},${cy}`);

	while (maxSteps-- > 0) {
		let foundNext = false;
		// Check 8 neighbors starting from backtrack direction
		for (let i = 0; i < 8; i++) {
			const dir = (backtrack + i) % 8;
			const nx = cx + dx[dir];
			const ny = cy + dy[dir];

			if (getVal(nx, ny) === 1) {
				// Move here
				cx = nx;
				cy = ny;
				path.push({ x: cx, y: cy });
				visited.add(`${cx},${cy}`);
				backtrack = (dir + 4 + 1) % 8; // Roughly +5 or -3
				foundNext = true;
				break;
			}
		}

		if (!foundNext || (cx === startX && cy === startY)) {
			break;
		}
	}

	return path;
}

function simplifyPath(points: { x: number; y: number }[], tolerance: number) {
	// Simple distance-based simplification
	if (points.length < 3) return points;
	const result = [points[0]];
	let prev = points[0];

	for (let i = 1; i < points.length; i++) {
		const curr = points[i];
		const d2 = (curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2;
		if (d2 > tolerance * tolerance) {
			result.push(curr);
			prev = curr;
		}
	}
	result.push(points[points.length - 1]);
	return result;
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}
