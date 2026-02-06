import type { Point } from '$lib/types';

// -------------------------------------------------------------------------- //
// State
// -------------------------------------------------------------------------- //

export interface DemoCursorState {
	visible: boolean;
	x: number;
	y: number;
	clicking: boolean;
	dragging: boolean;
}

export const demoCursor: DemoCursorState = $state({
	visible: false,
	x: 512,
	y: 384,
	clicking: false,
	dragging: false
});

// -------------------------------------------------------------------------- //
// Control / Animation
// -------------------------------------------------------------------------- //

export interface CursorOptions {
	/** Duration of movement in ms. Default 300ms. */
	duration?: number;
	/** Easing function (t: 0-1 => 0-1). Default cubic out. */
	ease?: (t: number) => number;
	/** If provided, scroll this element into view before moving. */
	targetElementId?: string;
	/** Action to perform. 'drag' implies holding drag state during move. */
	action?: 'click' | 'drag' | 'none';
	/** Callback when animation completes. */
	onComplete?: () => void;
	/** Callback on every frame with current position. */
	onUpdate?: (point: Point) => void;
	/** If true, jumps instantly instead of animating. */
	jump?: boolean;
}

/**
 * Cubic ease-out function
 */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Track current operation to handle race conditions and cancellations
let activeOperationId = 0;
let currentAnimation: {
	cancel: () => void;
	snap: () => void;
	complete: () => void;
} | null = null;

function cancelCurrentAnimation() {
	if (currentAnimation) {
		currentAnimation.cancel();
		currentAnimation.snap();
		currentAnimation.complete();
		currentAnimation = null;
	}
}

/**
 * Cancel all running cursor animations (exported for demo cleanup).
 */
export function cancelAllAnimations() {
	if (currentAnimation) {
		currentAnimation.cancel();
		// Don't call complete here - we're cancelling abruptly
		currentAnimation = null;
	}
	// Increment operation ID to invalidate any pending operations
	activeOperationId++;
	// Reset cursor interaction states
	demoCursor.clicking = false;
	demoCursor.dragging = false;
}

/**
 * High-level wrapper to targeting a specific element.
 * Handles finding, scrolling, and moving to the element.
 */
export async function moveCursorToElement(id?: string, options: CursorOptions = {}) {
	// If no ID is provided, immediately complete and return
	if (!id) {
		options.onComplete?.();
		return;
	}

	const opId = ++activeOperationId;

	if (!demoCursor.visible) {
		options.onComplete?.();
		return;
	}

	const action = options.action ?? 'click';
	const effectiveId = options.targetElementId || id;

	const el = getElementById(effectiveId);
	if (el) {
		// Only scroll and wait if element is not fully in view
		if (!isElementInViewport(el)) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
			// Wait for scroll
			await new Promise((r) => setTimeout(r, 600));
			// If another operation started during the delay, abort.
			if (opId !== activeOperationId) return;
		}
	}

	// Re-fetch target as position might have changed after scroll
	const freshTarget = getElementTarget(id);
	if (!freshTarget) {
		options.onComplete?.();
		return;
	}

	// Move
	return animateCursor([freshTarget], {
		...options,
		action,
		targetElementId: undefined // Handled above
	});
}

/**
 * Moves the cursor through a path of points.
 * Always starts from the current cursor position.
 */
export async function animateCursor(path: Point[], options: CursorOptions = {}) {
	// Start new operation
	const opId = ++activeOperationId;

	if (!demoCursor.visible) {
		cancelCurrentAnimation();
		options.onComplete?.();
		return;
	}

	// Cancel any running animation and snap it to end
	cancelCurrentAnimation();

	// Defaults
	const duration = options.duration ?? 300;
	const ease = options.ease ?? easeOutCubic;
	const jump = options.jump ?? false;
	const action = options.action ?? 'click';

	// 1. Handle Scrolling (Legacy support if called directly)
	if (options.targetElementId) {
		const el = getElementById(options.targetElementId);
		if (el) {
			if (!isElementInViewport(el)) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
				await new Promise((r) => setTimeout(r, 600));
				if (opId !== activeOperationId) return;
			}
		}
	}

	// 2. Prepare Path
	// Always prepend current position to ensure continuity
	const fullPath: Point[] = [{ x: demoCursor.x, y: demoCursor.y }, ...path];
	const endPoint = fullPath[fullPath.length - 1];

	// Handle immediate jump
	if (jump && fullPath.length > 0) {
		demoCursor.x = endPoint.x;
		demoCursor.y = endPoint.y;

		if (action === 'click') {
			handleInstantClick();
		}

		options.onComplete?.();
		return;
	}

	// 3. Start Action
	if (action === 'drag') {
		demoCursor.clicking = true;
		demoCursor.dragging = true;
	}

	// 4. Animate
	let rafId: number;
	const startTime = performance.now();

	return new Promise<void>((resolve) => {
		// Register cancellation hook
		currentAnimation = {
			cancel: () => cancelAnimationFrame(rafId),
			snap: () => {
				demoCursor.x = endPoint.x;
				demoCursor.y = endPoint.y;
			},
			complete: () => {
				// Ensure action effects allow cleanup
				if (action === 'drag') {
					demoCursor.clicking = false;
					demoCursor.dragging = false;
				} else if (action === 'click') {
					handleInstantClick();
				}
				options.onComplete?.();
				resolve();
			}
		};

		function loop() {
			const now = performance.now();
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / duration);
			const easedT = ease(t);

			// Interpolate along the path
			const point = getPointOnPath(fullPath, easedT);
			demoCursor.x = point.x;
			demoCursor.y = point.y;
			options.onUpdate?.(point);

			if (t < 1) {
				rafId = requestAnimationFrame(loop);
			} else {
				// Done naturally
				currentAnimation = null; // Clear self

				if (action === 'drag') {
					demoCursor.clicking = false;
					demoCursor.dragging = false;
				} else if (action === 'click') {
					handleInstantClick();
				}

				options.onComplete?.();
				resolve();
			}
		}
		rafId = requestAnimationFrame(loop);
	});
}

export function showCursor() {
	demoCursor.visible = true;
}

export function hideCursor() {
	demoCursor.visible = false;
	demoCursor.clicking = false;
	demoCursor.dragging = false;
}

function handleInstantClick() {
	demoCursor.clicking = true;
	setTimeout(() => {
		demoCursor.clicking = false;
	}, 200);
}

/**
 * Checks if an element is fully visible in the viewport and its scrollable parents.
 */
function isElementInViewport(el: Element): boolean {
	const rect = el.getBoundingClientRect();
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
	const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

	// In viewport bounds?
	if (rect.top < 0 || rect.left < 0 || rect.bottom > viewportHeight || rect.right > viewportWidth) {
		return false;
	}

	// Check scrollable parents
	let parent = el.parentElement;
	while (parent) {
		const style = window.getComputedStyle(parent);
		const overflow = style.overflow + style.overflowX + style.overflowY;
		if (/(auto|scroll)/.test(overflow)) {
			const pRect = parent.getBoundingClientRect();
			if (
				rect.top < pRect.top ||
				rect.left < pRect.left ||
				rect.right > pRect.right ||
				rect.bottom > pRect.bottom
			) {
				return false;
			}
		}
		parent = parent.parentElement;
	}

	return true;
}

// -------------------------------------------------------------------------- //
// Registry & Geometry
// -------------------------------------------------------------------------- //

interface CachedElement {
	id: string;
	rect: DOMRect;
	element: Element;
}

const elementRegistry = new Map<string, CachedElement>();
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;

export function initLayoutRegistry() {
	if (typeof window === 'undefined') return;

	// Reset
	cleanupLayoutRegistry();

	// Observer for size changes of tracked elements
	resizeObserver = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const id = entry.target.getAttribute('data-demo-id');
			if (id) updateElement(id, entry.target);
		}
	});

	// Observer for DOM tree changes (added/removed elements)
	mutationObserver = new MutationObserver(() => {
		scanAllElements();
	});

	mutationObserver.observe(document.body, { childList: true, subtree: true });

	// Initial scan
	scanAllElements();
}

export function cleanupLayoutRegistry() {
	resizeObserver?.disconnect();
	mutationObserver?.disconnect();
	resizeObserver = null;
	mutationObserver = null;
	elementRegistry.clear();
}

/**
 * Gets the center point of an element by ID.
 * Returns null if not found or not visible.
 */
export function getElementTarget(id: string, offset?: { x: number; y: number }): Point | null {
	const el = getElementById(id);
	if (!el) return null;

	// Always refresh rect to be safe
	const rect = el.getBoundingClientRect();

	// Check if roughly in viewport/visible (basic check)
	if (rect.width === 0 || rect.height === 0) return null;

	const center = {
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2
	};

	if (offset) {
		center.x += offset.x;
		center.y += offset.y;
	}

	return center;
}

// -------------------------------------------------------------------------- //
// Internals
// -------------------------------------------------------------------------- //

function getElementById(id: string): Element | null {
	// First check cache
	if (elementRegistry.has(id)) {
		const cached = elementRegistry.get(id)!;
		if (document.body.contains(cached.element)) {
			return cached.element;
		}
	}
	// Fallback to query
	const el = document.querySelector(`[data-demo-id="${id}"]`);
	if (el) {
		updateElement(id, el);
		return el;
	}
	return null;
}

function scanAllElements() {
	const elements = document.querySelectorAll('[data-demo-id]');
	elements.forEach((el) => {
		const id = el.getAttribute('data-demo-id');
		if (id) updateElement(id, el);
	});
}

function updateElement(id: string, el: Element) {
	const rect = el.getBoundingClientRect();
	elementRegistry.set(id, { id, rect, element: el });
	resizeObserver?.observe(el);
}

/**
 * Get point at t (0-1) along a multi-segment path
 */
function getPointOnPath(path: Point[], t: number): Point {
	if (path.length === 0) return { x: 0, y: 0 };
	if (path.length === 1) return path[0];

	// Calculate total length
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

	// Find segment
	for (let i = 0; i < dists.length; i++) {
		if (currentDist + dists[i] >= targetDist) {
			const segmentT = (targetDist - currentDist) / dists[i];
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
// -------------------------------------------------------------------------- //
// Scheduling & Queue
// -------------------------------------------------------------------------- //

const actionQueue: (() => Promise<void>)[] = [];
let isProcessingQueue = false;

/**
 * Adds an action to the sequential queue.
 * Actions are processed one by one.
 */
export function queueAction(action: () => Promise<void>) {
	actionQueue.push(action);
	processQueue();
}

/**
 * Clear the action queue (exported for demo cleanup).
 */
export function clearActionQueue() {
	actionQueue.length = 0;
	isProcessingQueue = false;
}

async function processQueue() {
	if (isProcessingQueue) return;
	if (actionQueue.length === 0) return;

	isProcessingQueue = true;
	while (actionQueue.length > 0) {
		const action = actionQueue.shift();
		if (action) {
			try {
				await action();
			} catch (err) {
				console.error('[DemoCursor] Queue action failed:', err);
			}
		}
	}
	isProcessingQueue = false;
}

/**
 * Waits for an element with the given data-demo-id to appear in the DOM.
 * Uses the MutationObserver from initLayoutRegistry to be efficient?
 * Actually simpler to just poll given we rely on it specifically for demo flow.
 */
export async function waitForTarget(id: string, timeout = 5000): Promise<boolean> {
	if (!demoCursor.visible) return false;

	const start = performance.now();

	// Check immediately
	if (getElementTarget(id)) return true;

	return new Promise((resolve) => {
		const check = () => {
			if (!demoCursor.visible) {
				resolve(false);
				return;
			}

			if (getElementTarget(id)) {
				resolve(true);
				return;
			}

			if (performance.now() - start > timeout) {
				console.warn(`[DemoCursor] Timeout waiting for target: ${id}`);
				resolve(false);
				return;
			}

			requestAnimationFrame(check);
		};
		check();
	});
}
