<script lang="ts">
	import {
		calculateBoundingBox,
		IDENTITY,
		isPointOnStroke,
		multiplyTransform,
		strokes,
		renderPendingStore,
		getHoveredGroupIds,
		selectGroup,
		addStroke,
		updateStroke,
		commitStrokeHistory
	} from '$lib/stores/canvas.svelte';
	import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';
	import { Layer, type Point, type Stroke, type StrokePoint, type Transform } from '$lib/types';
	import { CANVAS_HEIGHT, CANVAS_WIDTH } from '$lib/utils/constants';
	import { untrack } from 'svelte';

	type SelectionRect = { cx: number; cy: number; w: number; h: number; rot: number };
	type ActiveTransform = {
		mode: 'move' | 'scale' | 'rotate';
		handle?: string;
		startPointer: Point;
		startRect: SelectionRect;
		anchor?: Point;
		startVec?: Point;
		startAngle?: number;
		delta: Transform;
	};

	const isSelectMode = $derived(canvasToolbarState.mode === 'select');
	let mousePos = $state({ x: 0, y: 0 });
	let canvasPos = $state({ x: 0, y: 0 });
	let canvasFitEl: HTMLDivElement | null = null;
	let mainCanvasEl: HTMLCanvasElement | null = null;
	let mainCtx: CanvasRenderingContext2D | null = null;
	let isPointerInside = $state(false);
	let isDragging = $state(false);
	let cursor = $state('none');
	let renderPending = false;
	let selectionRect = $state.raw<SelectionRect | null>(null);
	let selectionBox = $state<{
		startX: number;
		startY: number;
		x: number;
		y: number;
		width: number;
		height: number;
	} | null>(null);
	let selectionHandles = $state.raw<{ x: number; y: number; kind: string }[]>([]);
	let activeTransform = $state.raw<ActiveTransform | null>(null);
	let activeStroke: Stroke | null = null;

	const strokeTuning = $state({
		smoothingStrength: 0.8, // 0 = light, 1 = aggressive
		cornerAngleThreshold: 1.15,
		slowSpeed: 0.01,
		fastSpeed: 0.1
	});

	const HANDLE_SIZE = 8;
	const HANDLE_HIT = 10;
	const ROTATE_OFFSET = 20;
	const ROTATE_RADIUS = 6;

	const oppositeHandleMap: Record<string, string> = {
		nw: 'se',
		n: 's',
		ne: 'sw',
		e: 'w',
		se: 'nw',
		s: 'n',
		sw: 'ne',
		w: 'e'
	};

	function tTranslate(x: number, y: number): Transform {
		return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
	}

	function tRotate(r: number): Transform {
		const c = Math.cos(r);
		const s = Math.sin(r);
		return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
	}

	function tScale(x: number, y: number): Transform {
		return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
	}

	function toWorld(rect: SelectionRect, p: Point): Point {
		const c = Math.cos(rect.rot);
		const s = Math.sin(rect.rot);
		return {
			x: rect.cx + p.x * c - p.y * s,
			y: rect.cy + p.x * s + p.y * c
		};
	}

	function toLocal(rect: SelectionRect, p: Point): Point {
		const dx = p.x - rect.cx;
		const dy = p.y - rect.cy;
		const c = Math.cos(rect.rot);
		const s = Math.sin(rect.rot);
		return { x: dx * c + dy * s, y: -dx * s + dy * c };
	}

	function handleLocal(rect: SelectionRect, kind: string): Point {
		const hw = rect.w / 2;
		const hh = rect.h / 2;
		switch (kind) {
			case 'nw':
				return { x: -hw, y: -hh };
			case 'n':
				return { x: 0, y: -hh };
			case 'ne':
				return { x: hw, y: -hh };
			case 'e':
				return { x: hw, y: 0 };
			case 'se':
				return { x: hw, y: hh };
			case 's':
				return { x: 0, y: hh };
			case 'sw':
				return { x: -hw, y: hh };
			case 'w':
				return { x: -hw, y: 0 };
			default:
				return { x: 0, y: 0 };
		}
	}

	function oppositeHandle(kind: string) {
		return oppositeHandleMap[kind] ?? kind;
	}

	function hasX(kind: string) {
		return (
			kind === 'e' ||
			kind === 'w' ||
			kind === 'ne' ||
			kind === 'nw' ||
			kind === 'se' ||
			kind === 'sw'
		);
	}

	function hasY(kind: string) {
		return (
			kind === 'n' ||
			kind === 's' ||
			kind === 'ne' ||
			kind === 'nw' ||
			kind === 'se' ||
			kind === 'sw'
		);
	}

	function pointInSelectionRect(point: Point) {
		if (!selectionRect) return false;
		const local = toLocal(selectionRect, point);
		return (
			Math.abs(local.x) <= Math.abs(selectionRect.w) / 2 &&
			Math.abs(local.y) <= Math.abs(selectionRect.h) / 2
		);
	}

	function syncSelectionRect() {
		let unionBox: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
		for (const id of canvasToolbarState.selectedIds) {
			const stroke = strokes.get(id);
			const box = stroke?.bounding;
			if (!box) continue;
			if (!unionBox) {
				unionBox = { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY };
			} else {
				unionBox.minX = Math.min(unionBox.minX, box.minX);
				unionBox.minY = Math.min(unionBox.minY, box.minY);
				unionBox.maxX = Math.max(unionBox.maxX, box.maxX);
				unionBox.maxY = Math.max(unionBox.maxY, box.maxY);
			}
		}
		if (unionBox) {
			selectionRect = {
				cx: (unionBox.minX + unionBox.maxX) / 2,
				cy: (unionBox.minY + unionBox.maxY) / 2,
				w: unionBox.maxX - unionBox.minX,
				h: unionBox.maxY - unionBox.minY,
				rot: 0
			};
		} else {
			selectionRect = null;
			selectionHandles = [];
		}
	}

	$effect(() => {
		if (!canvasToolbarState.mode) return;
		const selectedCount = canvasToolbarState.selectedIds.length;
		if (!selectedCount && !selectionRect) return;
		syncSelectionRect();
	});

	$effect(() => {
		if (!renderPendingStore.renderPending) return;
		untrack(() => (renderPendingStore.renderPending = false));
		scheduleRender();
	});

	$effect(() => {
		if (!canvasToolbarState.mode && canvasToolbarState.selectedIds.length < 0) return;
		scheduleRender();
	});

	function createStrokeId() {
		return `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	function ensureMainContext() {
		if (!mainCanvasEl || mainCtx) return;
		mainCtx = mainCanvasEl.getContext('2d');
	}

	function refreshStrokeCache(stroke: Stroke) {
		stroke.bounding = calculateBoundingBox([stroke]) ?? undefined;
		stroke.corners = computeCorners(stroke.points, strokeTuning.cornerAngleThreshold);
	}

	function renderStrokes() {
		if (!mainCanvasEl || !mainCtx) return;
		mainCtx.clearRect(0, 0, mainCanvasEl.width, mainCanvasEl.height);
		mainCtx.lineCap = 'round';
		mainCtx.lineJoin = 'round';

		const angleThreshold = strokeTuning.cornerAngleThreshold;
		const smoothingStrength = strokeTuning.smoothingStrength;

		const hoveredIds = new Set(getHoveredGroupIds());
		const externalHighlightIds = canvasToolbarState.highlightedStrokeIds;

		for (const stroke of strokes.values()) {
			const pts = stroke.points;
			if (pts.length === 0) continue;
			const isActiveLayer = stroke.layer === canvasToolbarState.activeLayer;
			const baseTransform = stroke.transform ?? IDENTITY;
			const isSelected = isActiveLayer && canvasToolbarState.selectedIds.includes(stroke.id);
			const t =
				activeTransform && isSelected
					? multiplyTransform(activeTransform.delta, baseTransform)
					: baseTransform;
			const hasTransform =
				t.a !== 1 || t.b !== 0 || t.c !== 0 || t.d !== 1 || t.e !== 0 || t.f !== 0;
			if (hasTransform) {
				mainCtx.save();
				mainCtx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
			}
			const isHovered =
				isActiveLayer && (hoveredIds.has(stroke.id) || externalHighlightIds.has(stroke.id));
			const baseLineWidth = stroke.size;
			mainCtx.strokeStyle = stroke.color;
			mainCtx.fillStyle = stroke.color;
			if (canvasToolbarState.activeLayer !== Layer.FINAL && !isActiveLayer) {
				mainCtx.globalAlpha = 0.5;
			}
			mainCtx.lineWidth = baseLineWidth;
			if (pts.length === 1) {
				const p = pts[0];
				mainCtx.beginPath();
				mainCtx.arc(p.x, p.y, mainCtx.lineWidth / 2, 0, Math.PI * 2);
				mainCtx.fill();
				if (isHovered) {
					mainCtx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
					mainCtx.lineWidth = baseLineWidth + 4;
					mainCtx.setLineDash([]);
					mainCtx.beginPath();
					mainCtx.arc(p.x, p.y, (baseLineWidth + 4) / 2, 0, Math.PI * 2);
					mainCtx.stroke();
				}
				if (hasTransform) mainCtx.restore();
				continue;
			}
			const corners = stroke.corners ?? computeCorners(pts, angleThreshold);
			mainCtx.beginPath();
			mainCtx.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length - 1; i += 1) {
				const curr = pts[i];
				const next = pts[i + 1];
				if (corners[i] || smoothingStrength <= 0.01) {
					mainCtx.lineTo(curr.x, curr.y);
				} else {
					const midX = (curr.x + next.x) / 2;
					const midY = (curr.y + next.y) / 2;
					const endX = curr.x + (midX - curr.x) * smoothingStrength;
					const endY = curr.y + (midY - curr.y) * smoothingStrength;
					mainCtx.quadraticCurveTo(curr.x, curr.y, endX, endY);
				}
			}
			const last = pts[pts.length - 1];
			mainCtx.lineTo(last.x, last.y);
			mainCtx.stroke();

			if (isHovered) {
				mainCtx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
				mainCtx.lineWidth = baseLineWidth + 4;
				mainCtx.setLineDash([]);
				mainCtx.beginPath();
				mainCtx.moveTo(pts[0].x, pts[0].y);
				for (let i = 1; i < pts.length - 1; i += 1) {
					const curr = pts[i];
					const next = pts[i + 1];
					if (corners[i] || smoothingStrength <= 0.01) {
						mainCtx.lineTo(curr.x, curr.y);
					} else {
						const midX = (curr.x + next.x) / 2;
						const midY = (curr.y + next.y) / 2;
						const endX = curr.x + (midX - curr.x) * smoothingStrength;
						const endY = curr.y + (midY - curr.y) * smoothingStrength;
						mainCtx.quadraticCurveTo(curr.x, curr.y, endX, endY);
					}
				}
				mainCtx.lineTo(last.x, last.y);
				mainCtx.stroke();
			}
			mainCtx.globalAlpha = 1;
			if (hasTransform) mainCtx.restore();
		}
	}

	function renderSelectionOverlay() {
		if (!mainCanvasEl || !mainCtx || !isSelectMode) return;

		mainCtx.save();
		mainCtx.lineWidth = 1;
		mainCtx.strokeStyle = 'rgba(59, 130, 246, 0.95)';
		mainCtx.setLineDash([6, 4]);

		if (selectionRect) {
			const rect = selectionRect;
			const hw = rect.w / 2;
			const hh = rect.h / 2;
			const localHandles = [
				{ x: -hw, y: -hh, kind: 'nw' },
				{ x: 0, y: -hh, kind: 'n' },
				{ x: hw, y: -hh, kind: 'ne' },
				{ x: hw, y: 0, kind: 'e' },
				{ x: hw, y: hh, kind: 'se' },
				{ x: 0, y: hh, kind: 's' },
				{ x: -hw, y: hh, kind: 'sw' },
				{ x: -hw, y: 0, kind: 'w' }
			];
			const worldHandles = localHandles.map((handle) => ({
				...toWorld(rect, handle),
				kind: handle.kind
			}));
			const rotateLocal = { x: 0, y: -hh - ROTATE_OFFSET };
			const rotateWorld = toWorld(rect, rotateLocal);

			mainCtx.save();
			mainCtx.translate(rect.cx, rect.cy);
			mainCtx.rotate(rect.rot);
			mainCtx.strokeRect(-hw, -hh, rect.w, rect.h);

			for (const handle of localHandles) {
				mainCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
				mainCtx.fillRect(
					handle.x - HANDLE_SIZE / 2,
					handle.y - HANDLE_SIZE / 2,
					HANDLE_SIZE,
					HANDLE_SIZE
				);
				mainCtx.strokeRect(
					handle.x - HANDLE_SIZE / 2,
					handle.y - HANDLE_SIZE / 2,
					HANDLE_SIZE,
					HANDLE_SIZE
				);
			}

			mainCtx.beginPath();
			mainCtx.moveTo(0, -hh);
			mainCtx.lineTo(rotateLocal.x, rotateLocal.y);
			mainCtx.stroke();
			mainCtx.beginPath();
			mainCtx.arc(rotateLocal.x, rotateLocal.y, ROTATE_RADIUS, 0, Math.PI * 2);
			mainCtx.fill();
			mainCtx.stroke();
			mainCtx.restore();

			selectionHandles = [...worldHandles, { x: rotateWorld.x, y: rotateWorld.y, kind: 'rotate' }];
		} else {
			selectionHandles = [];
		}

		if (selectionBox) {
			mainCtx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
			mainCtx.setLineDash([4, 4]);
			mainCtx.fillStyle = 'rgba(96, 165, 250, 0.2)';
			mainCtx.fillRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
			mainCtx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.width, selectionBox.height);
		}
		mainCtx.restore();
	}

	function scheduleRender() {
		if (renderPending) return;
		renderPending = true;
		requestAnimationFrame(() => {
			renderPending = false;
			ensureMainContext();
			renderStrokes();
			renderSelectionOverlay();
		});
	}

	function isCornerPoint(points: StrokePoint[], index: number, angleThreshold: number) {
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

	function reduceStroke(points: StrokePoint[]) {
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

	function computeCorners(points: StrokePoint[], angleThreshold: number) {
		if (points.length === 0) return [];
		const corners = new Array(points.length).fill(false);
		corners[0] = true;
		corners[points.length - 1] = true;
		for (let i = 1; i < points.length - 1; i += 1) {
			corners[i] = isCornerPoint(points, i, angleThreshold);
		}
		return corners;
	}

	function updateMousePos(event: PointerEvent) {
		if (!canvasFitEl) return;
		if (!mainCanvasEl) return;
		const rect = canvasFitEl.getBoundingClientRect();
		mousePos = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};
		if (rect.width > 0 && rect.height > 0) {
			const scaleX = mainCanvasEl.width / rect.width;
			const scaleY = mainCanvasEl.height / rect.height;
			canvasPos = {
				x: mousePos.x * scaleX,
				y: mousePos.y * scaleY
			};
		}
	}

	function handleSelectionOverlay() {
		if (!isSelectMode) {
			cursor = 'none';
			return;
		}
		let nextCursor = 'default';
		let overHandle = false;
		const handleSize = HANDLE_HIT;
		for (const handle of selectionHandles) {
			const half = handle.kind === 'rotate' ? ROTATE_RADIUS : handleSize / 2;
			if (
				canvasPos.x >= handle.x - half &&
				canvasPos.x <= handle.x + half &&
				canvasPos.y >= handle.y - half &&
				canvasPos.y <= handle.y + half
			) {
				overHandle = true;
				switch (handle.kind) {
					case 'nw':
					case 'se':
						nextCursor = 'nwse-resize';
						break;
					case 'ne':
					case 'sw':
						nextCursor = 'nesw-resize';
						break;
					case 'n':
					case 's':
						nextCursor = 'ns-resize';
						break;
					case 'e':
					case 'w':
						nextCursor = 'ew-resize';
						break;
					case 'rotate':
						nextCursor = 'grab';
						break;
					default:
						nextCursor = 'default';
				}
				break;
			}
		}
		if (!overHandle) {
			if (selectionRect && pointInSelectionRect(canvasPos)) nextCursor = 'move';
			else if (canvasToolbarState.hoveredStrokeId) nextCursor = 'pointer';
		}
		cursor = nextCursor;
	}

	function findHandleAt(point: Point) {
		const handleSize = HANDLE_HIT;
		for (const handle of selectionHandles) {
			const half = handle.kind === 'rotate' ? ROTATE_RADIUS : handleSize / 2;
			if (
				point.x >= handle.x - half &&
				point.x <= handle.x + half &&
				point.y >= handle.y - half &&
				point.y <= handle.y + half
			) {
				return handle;
			}
		}
		return null;
	}

	function findSelectableStroke() {
		const list = Array.from(strokes.values());
		for (let i = list.length - 1; i >= 0; i -= 1) {
			const stroke = list[i];
			if (stroke.layer !== canvasToolbarState.activeLayer) continue;
			if (isPointOnStroke(canvasPos, stroke)) return stroke;
		}
		return null;
	}

	function handlePointerDown(event: PointerEvent) {
		updateMousePos(event);
		isPointerInside = true;
		canvasFitEl?.setPointerCapture(event.pointerId);

		if (isSelectMode) {
			const handle = selectionRect ? findHandleAt(canvasPos) : null;
			if (handle && selectionRect) {
				const startRect = selectionRect;
				const startPointer = { x: canvasPos.x, y: canvasPos.y };
				if (handle.kind === 'rotate') {
					activeTransform = {
						mode: 'rotate',
						handle: 'rotate',
						startPointer,
						startRect,
						startAngle: Math.atan2(canvasPos.y - startRect.cy, canvasPos.x - startRect.cx),
						delta: IDENTITY
					};
				} else {
					const anchorKind = oppositeHandle(handle.kind);
					const anchorLocal = handleLocal(startRect, anchorKind);
					const handleLocalPos = handleLocal(startRect, handle.kind);
					const anchorWorld = toWorld(startRect, anchorLocal);
					activeTransform = {
						mode: 'scale',
						handle: handle.kind,
						startPointer,
						startRect,
						anchor: anchorWorld,
						startVec: { x: handleLocalPos.x - anchorLocal.x, y: handleLocalPos.y - anchorLocal.y },
						delta: IDENTITY
					};
				}
				scheduleRender();
				return;
			}
			if (selectionRect && pointInSelectionRect(canvasPos)) {
				activeTransform = {
					mode: 'move',
					startPointer: { x: canvasPos.x, y: canvasPos.y },
					startRect: selectionRect,
					delta: IDENTITY
				};
				scheduleRender();
				return;
			}
			if (canvasToolbarState.hoveredStrokeId) {
				if (canvasToolbarState.groupSelect) {
					selectGroup(canvasToolbarState.hoveredStrokeId, event.shiftKey);
				} else if (event.shiftKey) {
					const next = new Set(canvasToolbarState.selectedIds);
					if (next.has(canvasToolbarState.hoveredStrokeId))
						next.delete(canvasToolbarState.hoveredStrokeId);
					else next.add(canvasToolbarState.hoveredStrokeId);
					canvasToolbarState.selectedIds = Array.from(next);
				} else {
					canvasToolbarState.selectedIds = [canvasToolbarState.hoveredStrokeId];
				}
				selectionBox = null;
				if (!event.shiftKey) {
					syncSelectionRect();
					if (selectionRect) {
						activeTransform = {
							mode: 'move',
							startPointer: { x: canvasPos.x, y: canvasPos.y },
							startRect: selectionRect,
							delta: IDENTITY
						};
					}
				}
			} else if (!event.shiftKey) {
				canvasToolbarState.selectedIds = [];
				selectionBox = {
					startX: canvasPos.x,
					startY: canvasPos.y,
					x: canvasPos.x,
					y: canvasPos.y,
					width: 0,
					height: 0
				};
			}
			scheduleRender();
			return;
		}

		isDragging = true;
		canvasToolbarState.isDrawing = true;
		activeStroke = {
			id: createStrokeId(),
			points: [{ x: canvasPos.x, y: canvasPos.y, t: performance.now() }],
			color: canvasToolbarState.brushColor,
			size: canvasToolbarState.brushSize,
			layer: canvasToolbarState.activeLayer
		};
		addStroke(activeStroke);

		handleSelectionOverlay();
		scheduleRender();
	}

	function handlePointerUp(event: PointerEvent) {
		updateMousePos(event);
		if (activeTransform) {
			const delta = activeTransform.delta;
			for (const id of canvasToolbarState.selectedIds) {
				const stroke = strokes.get(id);
				if (!stroke) continue;
				stroke.transform = multiplyTransform(delta, stroke.transform ?? IDENTITY);
				refreshStrokeCache(stroke);
				updateStroke(stroke);
			}
			activeTransform = null;
			commitStrokeHistory();
			scheduleRender();
			canvasFitEl?.releasePointerCapture(event.pointerId);
			return;
		}
		if (selectionBox) {
			const box = selectionBox;
			const boxMinX = Math.min(box.startX, canvasPos.x);
			const boxMinY = Math.min(box.startY, canvasPos.y);
			const boxMaxX = Math.max(box.startX, canvasPos.x);
			const boxMaxY = Math.max(box.startY, canvasPos.y);
			const nextIds: string[] = [];
			for (const stroke of strokes.values()) {
				const bounds = stroke.bounding;
				if (!bounds || stroke.layer !== canvasToolbarState.activeLayer) continue;
				const ix = Math.max(0, Math.min(bounds.maxX, boxMaxX) - Math.max(bounds.minX, boxMinX));
				const iy = Math.max(0, Math.min(bounds.maxY, boxMaxY) - Math.max(bounds.minY, boxMinY));
				const intersectionArea = ix * iy;
				const strokeArea = Math.max(1, bounds.width * bounds.height);
				if (intersectionArea / strokeArea >= 0.4) nextIds.push(stroke.id);
			}
			if (event.shiftKey) {
				const next = new Set(canvasToolbarState.selectedIds);
				for (const id of nextIds) {
					if (next.has(id)) next.delete(id);
					else next.add(id);
				}
				canvasToolbarState.selectedIds = Array.from(next);
			} else {
				canvasToolbarState.selectedIds = nextIds;
			}
			selectionBox = null;
			scheduleRender();
		}

		if (!isSelectMode && activeStroke) {
			activeStroke.points.push({ x: canvasPos.x, y: canvasPos.y, t: performance.now() });
			const reducedPoints = reduceStroke(activeStroke.points);
			activeStroke.points = reducedPoints;
			refreshStrokeCache(activeStroke);
			updateStroke(activeStroke);
			commitStrokeHistory();
			canvasToolbarState.isDrawing = false;
			scheduleRender();
		}
		isDragging = false;
		activeStroke = null;
		canvasFitEl?.releasePointerCapture(event.pointerId);
	}

	function handlePointerLeave() {
		isPointerInside = false;
	}

	function handlePointerMove(event: PointerEvent) {
		updateMousePos(event);
		if (isSelectMode) {
			if (activeTransform) {
				const t = activeTransform;
				if (t.mode === 'move') {
					const dx = canvasPos.x - t.startPointer.x;
					const dy = canvasPos.y - t.startPointer.y;
					selectionRect = {
						...t.startRect,
						cx: t.startRect.cx + dx,
						cy: t.startRect.cy + dy
					};
					activeTransform = { ...t, delta: tTranslate(dx, dy) };
					scheduleRender();
					return;
				}
				if (t.mode === 'rotate') {
					const angle = Math.atan2(canvasPos.y - t.startRect.cy, canvasPos.x - t.startRect.cx);
					const deltaAngle = angle - (t.startAngle ?? 0);
					selectionRect = {
						...t.startRect,
						rot: t.startRect.rot + deltaAngle
					};
					const delta = multiplyTransform(
						tTranslate(t.startRect.cx, t.startRect.cy),
						multiplyTransform(tRotate(deltaAngle), tTranslate(-t.startRect.cx, -t.startRect.cy))
					);
					activeTransform = { ...t, delta };
					scheduleRender();
					return;
				}
				if (t.mode === 'scale') {
					const start = t.startRect;
					const handle = t.handle ?? 'se';
					const anchor = t.anchor ?? { x: start.cx, y: start.cy };
					const local = toLocal(
						{ cx: anchor.x, cy: anchor.y, w: 0, h: 0, rot: start.rot },
						canvasPos
					);
					const sv = t.startVec ?? { x: 1, y: 1 };
					let sx = sv.x ? local.x / sv.x : 1;
					let sy = sv.y ? local.y / sv.y : 1;
					if (!Number.isFinite(sx)) sx = 1;
					if (!Number.isFinite(sy)) sy = 1;
					if (!hasX(handle)) sx = 1;
					if (!hasY(handle)) sy = 1;
					const w = hasX(handle) ? start.w * sx : start.w;
					const h = hasY(handle) ? start.h * sy : start.h;
					const rect = { ...start, w, h };
					const anchorLocal = handleLocal(rect, oppositeHandle(handle));
					const c = Math.cos(start.rot);
					const s = Math.sin(start.rot);
					const cx = anchor.x - (anchorLocal.x * c - anchorLocal.y * s);
					const cy = anchor.y - (anchorLocal.x * s + anchorLocal.y * c);
					selectionRect = { cx, cy, w, h, rot: start.rot };
					const delta = multiplyTransform(
						tTranslate(anchor.x, anchor.y),
						multiplyTransform(
							tRotate(start.rot),
							multiplyTransform(
								tScale(sx, sy),
								multiplyTransform(tRotate(-start.rot), tTranslate(-anchor.x, -anchor.y))
							)
						)
					);
					activeTransform = { ...t, delta };
					scheduleRender();
					return;
				}
			}
			const prevHover = canvasToolbarState.hoveredStrokeId;
			const hit = findSelectableStroke();
			canvasToolbarState.hoveredStrokeId = hit ? hit.id : null;
			if (prevHover !== canvasToolbarState.hoveredStrokeId) scheduleRender();
			if (selectionBox) {
				const minX = Math.min(selectionBox.startX, canvasPos.x);
				const minY = Math.min(selectionBox.startY, canvasPos.y);
				const maxX = Math.max(selectionBox.startX, canvasPos.x);
				const maxY = Math.max(selectionBox.startY, canvasPos.y);
				selectionBox = {
					...selectionBox,
					x: minX,
					y: minY,
					width: maxX - minX,
					height: maxY - minY
				};
				scheduleRender();
			}
			handleSelectionOverlay();
		}

		if (!isSelectMode && isDragging && activeStroke) {
			activeStroke.points.push({ x: canvasPos.x, y: canvasPos.y, t: performance.now() });
			scheduleRender();
		}
	}

	function handlePointerEnter() {
		isPointerInside = true;
		handleSelectionOverlay();
	}

	$effect(() => {
		if (!canvasToolbarState.mode) return;
		if (isPointerInside) {
			handleSelectionOverlay();
		}
	});
</script>

<div class="canvas-frame">
	<div
		class="canvas-fit {canvasToolbarState.activeLayer === Layer.FINAL ? 'pointer-events-none' : ''}"
		role="application"
		aria-label="Canvas drawing area"
		bind:this={canvasFitEl}
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerUp}
		onpointerleave={handlePointerLeave}
		onpointermove={handlePointerMove}
		onpointerenter={handlePointerEnter}
		style="cursor: {cursor};"
	>
		<!-- Main drawing -->
		<canvas
			width={CANVAS_WIDTH}
			height={CANVAS_HEIGHT}
			class="pointer-events-none absolute inset-0 h-full w-full bg-black"
			bind:this={mainCanvasEl}
		></canvas>

		<!-- Cursor -->
		{#if cursor === 'none'}
			<div
				class="absolute z-100 rounded-full border-2 border-gray-300"
				style:display={isPointerInside ? 'block' : 'none'}
				style="
				 width: {canvasToolbarState.brushSize}px;
				 height: {canvasToolbarState.brushSize}px;
				 left: {mousePos.x}px;
				 top: {mousePos.y}px;
				 transform: translate(-50%, -50%);
			 "
			></div>
		{/if}
	</div>
</div>

<style>
	.canvas-frame {
		display: flex;
		height: 100%;
		width: 100%;
		align-items: center;
		justify-content: center;
		container-type: size;
	}

	.canvas-fit {
		position: relative;
		aspect-ratio: 4 / 3;
		width: 100%;
		height: auto;
		max-width: 100%;
		max-height: 100%;
		touch-action: none;
	}

	@container (min-aspect-ratio: 4/3) {
		.canvas-fit {
			height: 100%;
			width: auto;
		}
	}
</style>
