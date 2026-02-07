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
export async function traceImage(imageUrl: string, options: TracerOptions = {}): Promise<Stroke[]> {
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
	// We'll treat alpha > threshold as "inside" (1) and <= threshold as "outside" (0)
	// Helper to get value at x,y
	const getVal = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= width || y >= height) return 0;
		const idx = (y * width + x) * 4;
		// Check alpha (idx + 3) and maybe RGB darkness (since output is black lines on white)
		// Usually output is "black lines" -> low RGB, high Alpha.
		// If input is white background with black lines:
		// White = (255, 255, 255, 255)
		// Black = (0, 0, 0, 255)
		// We want to trace the BLACK parts.
		// So "inside" = darker pixels.
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
	const strokes: Stroke[] = [];

	// Step size to reduce resolution/noise
	const step = 2;

	for (let y = 0; y < height; y += step) {
		for (let x = 0; x < width; x += step) {
			if (getVal(x, y) === 1 && !visited.has(`${x},${y}`)) {
				// Found a new black pixel, start tracing
				const path = traceBoundary(x, y, getVal, visited, width, height);
				if (path.length > 10) {
					// Filter tiny dots
					// Simplify path
					const simplified = simplifyPath(path, 2);
					const strokePoints = simplified.map((p) => ({
						x: p.x,
						y: p.y,
						t: Date.now() // Dummy time
					}));

					if (strokePoints.length > 2) {
						const stroke: Stroke = {
							id: createStrokeId(),
							points: strokePoints,
							color: traceColor,
							size: 2, // Default size
							layer: canvasToolbarState.activeLayer
						};
						stroke.bounding = calculateBoundingBox([stroke]) ?? undefined;
						strokes.push(stroke);
					}
				}
			}
		}
	}

	return strokes;
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
