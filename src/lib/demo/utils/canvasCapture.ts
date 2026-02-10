import { strokes as strokesStore } from '$lib/stores/canvas.svelte';
import type { Stroke } from '$lib/types';

export async function captureCanvasWithHighlights(targetStrokeIds: Set<string>) {
	const canvas = document.querySelector('canvas');
	if (!canvas) {
		throw new Error('Canvas element not found');
	}

	const width = canvas.width;
	const height = canvas.height;

	// Create offscreen canvas for processing
	const offscreen = document.createElement('canvas');
	offscreen.width = width;
	offscreen.height = height;
	const ctx = offscreen.getContext('2d');
	if (!ctx) throw new Error('Could not get context');

	// Clear background (transparent)
	ctx.clearRect(0, 0, width, height);

	// Render Context Image (Everything dimmed except target)
	// Actually, context image usually shows EVERYTHING, but non-targets are dimmed.
	// For Intent Image, only Show Target.

	// 1. Generate Context Image
	// Draw non-target strokes with low opacity
	strokesStore.forEach((stroke) => {
		if (!targetStrokeIds.has(stroke.id)) {
			drawStroke(ctx, stroke, 0.2);
		}
	});
	// Draw target strokes with full opacity
	strokesStore.forEach((stroke) => {
		if (targetStrokeIds.has(stroke.id)) {
			drawStroke(ctx, stroke, 1.0);
		}
	});

	const contextImage = offscreen.toDataURL('image/png');

	// 2. Generate Intent Image (Only Targets)
	ctx.clearRect(0, 0, width, height); // Clear again for Intent Image

	strokesStore.forEach((stroke) => {
		if (targetStrokeIds.has(stroke.id)) {
			drawStroke(ctx, stroke, 1.0);
		}
	});

	const intentImage = offscreen.toDataURL('image/png');

	return { contextImage, intentImage };
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, alpha: number) {
	if (stroke.points.length < 2) return;

	ctx.beginPath();
	ctx.globalAlpha = alpha;
	ctx.strokeStyle = stroke.color;
	ctx.lineWidth = stroke.size;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
	for (let i = 1; i < stroke.points.length; i++) {
		ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
	}
	ctx.stroke();
	ctx.globalAlpha = 1.0;
}
