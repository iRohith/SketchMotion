<script lang="ts">
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';
	import {
		strokes,
		groupState,
		calculateBoundingBox,
		groups,
		requestRender
	} from '$lib/stores/canvas.svelte';
	import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';
	import {
		addAnalysisItem,
		updateAnalysisItem,
		analysisResults,
		setAnalysisItemFeedback
	} from '$lib/stores/analysis.svelte';
	import type { Stroke } from '$lib/types';
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import { CANVAS_HEIGHT, CANVAS_WIDTH } from '$lib/utils/constants';
	import { canvasToScreen } from '$lib/utils/demoStroke';
	import { moveCursorToElement } from '$lib/stores/demoCursor.svelte';

	type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };

	type QueueItem = {
		id: string;
		clusterId: string;
		strokeIds: Set<string>;
		timestamp: number;
		status: 'pending' | 'awaiting' | 'sending' | 'sent';
	};

	type TrackedCluster = {
		strokeIds: Set<string>;
		analysisItemId: string | null;
		bounds: BoundingBox;
		lastUpdate: number;
		skipped: boolean; // True if user ignored the ask prompt
	};

	type CanvasHover = {
		type: 'ask' | 'result';
		clusterId: string;
		analysisItemId?: string;
		position: { x: number; y: number };
		title?: string;
		content?: string;
		visible: boolean;
	};

	// --- Configuration ---
	const IDLE_THRESHOLD = 1500;
	const SEND_DELAY = 1000;
	const HOVER_TIMEOUT = 5000;

	// --- State ---
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let analysisQueue = $state<QueueItem[]>([]);
	let isSending = $state(false);
	let lastSnapshotTime = 0;
	let trackedClusters = new Map<string, TrackedCluster>();
	let clientId = '';

	// Initialize client ID
	$effect(() => {
		const stored = localStorage.getItem('sketch_client_id');
		if (stored) {
			clientId = stored;
		} else {
			clientId = crypto.randomUUID();
			localStorage.setItem('sketch_client_id', clientId);
		}
	});

	// Canvas hover notification
	let canvasHover = $state<CanvasHover | null>(null);
	let hoverTimeoutId: ReturnType<typeof setTimeout> | null = null;

	// Resolve function for current ask prompt
	let askResolve: ((result: 'yes' | 'no' | 'dismissed') => void) | null = null;

	// --- Effects ---

	// Trigger accumulation when groups change (after idle)
	$effect(() => {
		const version = groupState.version;
		if (version < 0) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			runAccumulation();
		}, IDLE_THRESHOLD);
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	});

	// Hide hover on drawing start - only reads isDrawing, uses untrack for canvasHover check
	$effect(() => {
		const isDrawing = canvasToolbarState.isDrawing;
		if (isDrawing) {
			untrack(() => {
				if (canvasHover) {
					dismissHover('dismissed');
				}
			});
		}
	});

	// Highlight strokes on canvas when hovering analysis item
	// Only reads hoveredItemId, writes to highlightedStrokeIds via untrack
	$effect(() => {
		const hoveredId = analysisResults.hoveredItemId;
		untrack(() => {
			if (hoveredId) {
				let foundStrokes: Set<string> | null = null;
				for (const tracker of trackedClusters.values()) {
					if (tracker.analysisItemId === hoveredId) {
						foundStrokes = tracker.strokeIds;
						break;
					}
				}
				if (foundStrokes) {
					canvasToolbarState.highlightedStrokeIds = foundStrokes;
					requestRender();
				} else {
					canvasToolbarState.highlightedStrokeIds = new Set();
					requestRender();
				}
			} else {
				canvasToolbarState.highlightedStrokeIds = new Set();
				requestRender();
			}
		});
	});

	// Process queue - triggered when queue changes, uses separate flag to avoid re-triggering
	$effect(() => {
		const queueLength = analysisQueue.length;
		const sending = isSending;
		if (!sending && queueLength > 0) {
			untrack(() => {
				const pending = analysisQueue.find((i) => i.status === 'pending');
				if (pending) {
					processQueueItem(pending);
				}
			});
		}
	});

	// Dismiss hover when cluster strokes are deleted (via groupState.version)
	$effect(() => {
		const version = groupState.version;
		void version;

		untrack(() => {
			if (!canvasHover) return;

			const tracker = trackedClusters.get(canvasHover.clusterId);
			if (!tracker) {
				dismissHover('dismissed');
				return;
			}

			// Check if any strokes from this cluster still exist
			let hasValidStrokes = false;
			for (const strokeId of tracker.strokeIds) {
				if (strokes.has(strokeId)) {
					hasValidStrokes = true;
					break;
				}
			}

			if (!hasValidStrokes) {
				dismissHover('dismissed');
			}
		});
	});

	// --- Hover Management ---

	function getHoverPosition(bounds: BoundingBox): { x: number; y: number } {
		// Position at bottom-center of the bounding box, converted to screen coords
		const canvasPoint = {
			x: (bounds.minX + bounds.maxX) / 2,
			y: bounds.maxY + 15
		};

		const screenPoint = canvasToScreen(canvasPoint);
		if (screenPoint) {
			return {
				x: Math.max(10, Math.min(screenPoint.x, window.innerWidth - 220)),
				y: Math.min(screenPoint.y, window.innerHeight - 120)
			};
		}

		// Fallback if canvas element not found
		return { x: 100, y: 100 };
	}

	function showAskHover(
		clusterId: string,
		bounds: BoundingBox
	): Promise<'yes' | 'no' | 'dismissed'> {
		return new Promise((resolve) => {
			askResolve = resolve;
			const position = getHoverPosition(bounds);
			canvasHover = {
				type: 'ask',
				clusterId,
				position,
				visible: true
			};
			startHoverTimeout();
		});
	}

	function showResultHover(
		clusterId: string,
		analysisItemId: string,
		bounds: BoundingBox,
		title: string,
		content: string
	) {
		const position = getHoverPosition(bounds);
		canvasHover = {
			type: 'result',
			clusterId,
			analysisItemId,
			position,
			title,
			content,
			visible: true
		};
		startHoverTimeout();
	}

	function startHoverTimeout() {
		if (hoverTimeoutId) clearTimeout(hoverTimeoutId);
		hoverTimeoutId = setTimeout(() => {
			dismissHover('dismissed');
		}, HOVER_TIMEOUT);
	}

	function pauseHoverTimeout() {
		if (hoverTimeoutId) {
			clearTimeout(hoverTimeoutId);
			hoverTimeoutId = null;
		}
	}

	function resumeHoverTimeout() {
		if (canvasHover && canvasHover.visible) {
			startHoverTimeout();
		}
	}

	function dismissHover(result: 'yes' | 'no' | 'dismissed' = 'dismissed') {
		if (hoverTimeoutId) {
			clearTimeout(hoverTimeoutId);
			hoverTimeoutId = null;
		}
		if (askResolve) {
			askResolve(result);
			askResolve = null;
		}
		if (canvasHover) {
			canvasHover = { ...canvasHover, visible: false };
			setTimeout(() => {
				canvasHover = null;
			}, 300);
		}
	}

	function handleAskResponse(response: 'yes' | 'no') {
		const elementId = canvasHover ? `hover-ask-${response}-${canvasHover.clusterId}` : undefined;
		moveCursorToElement(elementId, {
			onComplete: () => {
				dismissHover(response);
			}
		});
	}

	function handleResultFeedback(feedback: 'yes' | 'no') {
		const elementId = canvasHover
			? `hover-feedback-${feedback}-${canvasHover.clusterId}`
			: undefined;
		if (canvasHover?.analysisItemId) {
			setAnalysisItemFeedback(canvasHover.analysisItemId, feedback, undefined, elementId, {
				onComplete: () => {
					dismissHover('dismissed');
				}
			});
		}
	}

	// --- Core Logic ---

	function runAccumulation() {
		if (strokes.size === 0) return;

		const currentGroupSets: Set<string>[] = Array.from(groups.values()).map((s) => new Set(s));
		if (currentGroupSets.length === 0) return;

		const spatialClusters = clusterSetsSpatially(currentGroupSets);

		let maxTimeFound = lastSnapshotTime;

		for (const clusterStrokeIds of spatialClusters) {
			const clusterStrokes = getStrokeList(clusterStrokeIds);
			if (clusterStrokes.length === 0) continue;

			const bounds = calculateBoundingBox(clusterStrokes);
			if (!bounds) continue;

			let hasNewContent = false;
			for (const s of clusterStrokes) {
				const endT = s.points[s.points.length - 1]?.t || 0;
				if (endT > lastSnapshotTime) {
					hasNewContent = true;
				}
				if (endT > maxTimeFound) maxTimeFound = endT;
			}

			const matchResult = findBestMatch(clusterStrokeIds);

			if (matchResult.clusterId) {
				const tracker = trackedClusters.get(matchResult.clusterId)!;
				const mergedIds = new Set([...tracker.strokeIds, ...clusterStrokeIds]);
				tracker.strokeIds = mergedIds;

				const allStrokes = getStrokeList(mergedIds);
				const newBounds = calculateBoundingBox(allStrokes);
				if (newBounds) {
					tracker.bounds = {
						minX: newBounds.minX,
						minY: newBounds.minY,
						maxX: newBounds.maxX,
						maxY: newBounds.maxY
					};
				}
				tracker.lastUpdate = Date.now();

				if (hasNewContent) {
					// Unskip if user is drawing near this cluster again
					tracker.skipped = false;
					queueCluster(matchResult.clusterId, mergedIds);
				}
			} else {
				const newClusterId = crypto.randomUUID();
				trackedClusters.set(newClusterId, {
					strokeIds: clusterStrokeIds,
					analysisItemId: null,
					bounds: {
						minX: bounds.minX,
						minY: bounds.minY,
						maxX: bounds.maxX,
						maxY: bounds.maxY
					},
					lastUpdate: Date.now(),
					skipped: false
				});

				if (hasNewContent) {
					queueCluster(newClusterId, clusterStrokeIds);
				}
			}
		}

		lastSnapshotTime = maxTimeFound;
	}

	/**
	 * Find a tracked cluster that should be updated with the new strokes.
	 * Returns a match ONLY if the old cluster's strokes are fully contained in the new set.
	 * This ensures we only update an existing analysis when adding to the same drawing.
	 */
	function findBestMatch(newStrokeIds: Set<string>): {
		clusterId: string | null;
		isContained: boolean;
	} {
		for (const [clusterId, tracker] of trackedClusters.entries()) {
			// Check if ALL of tracker's strokes are in newStrokeIds (subset containment)
			let allContained = true;
			for (const strokeId of tracker.strokeIds) {
				if (!newStrokeIds.has(strokeId)) {
					allContained = false;
					break;
				}
			}

			if (allContained) {
				// If user gave feedback on this item, don't allow updates
				if (tracker.analysisItemId) {
					const item = analysisResults.items.find((i) => i.id === tracker.analysisItemId);
					if (item?.feedback) {
						// User interacted - don't merge, let new cluster be created
						continue;
					}
				}
				return { clusterId, isContained: true };
			}
		}

		return { clusterId: null, isContained: false };
	}

	function queueCluster(clusterId: string, strokeIds: Set<string>) {
		const existingQ = analysisQueue.find(
			(q) => q.clusterId === clusterId && (q.status === 'pending' || q.status === 'awaiting')
		);
		if (existingQ) {
			existingQ.strokeIds = strokeIds;
			existingQ.timestamp = Date.now();
			analysisQueue = [...analysisQueue];
		} else {
			analysisQueue = [
				...analysisQueue,
				{
					id: crypto.randomUUID(),
					clusterId,
					strokeIds: new Set(strokeIds),
					timestamp: Date.now(),
					status: 'pending'
				}
			];
		}
	}

	function clusterSetsSpatially(sets: Set<string>[]): Set<string>[] {
		const clusters = sets.map((s) => new Set(s));
		let merged = true;
		while (merged) {
			merged = false;
			for (let i = 0; i < clusters.length; i++) {
				if (clusters[i].size === 0) continue;
				for (let j = i + 1; j < clusters.length; j++) {
					if (clusters[j].size === 0) continue;

					const rangeA = getTimeRange(clusters[i]);
					const rangeB = getTimeRange(clusters[j]);
					const gap = Math.max(0, rangeB.min - rangeA.max, rangeA.min - rangeB.max);

					if (gap > 3000) continue;

					if (checkOverlap(clusters[i], clusters[j])) {
						for (const id of clusters[j]) clusters[i].add(id);
						clusters[j].clear();
						merged = true;
					}
				}
			}
		}
		return clusters.filter((s) => s.size > 0);
	}

	function getTimeRange(ids: Set<string>): { min: number; max: number } {
		let min = Infinity;
		let max = -Infinity;
		for (const id of ids) {
			const s = strokes.get(id);
			if (s && s.points.length > 0) {
				const start = s.points[0].t;
				const end = s.points[s.points.length - 1].t;
				if (start < min) min = start;
				if (end > max) max = end;
			}
		}
		if (min === Infinity) return { min: 0, max: 0 };
		return { min, max };
	}

	function checkOverlap(setA: Set<string>, setB: Set<string>): boolean {
		const boxA = calculateBoundingBox(getStrokeList(setA));
		const boxB = calculateBoundingBox(getStrokeList(setB));
		if (!boxA || !boxB) return false;

		const intersectionW = Math.max(
			0,
			Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX)
		);
		const intersectionH = Math.max(
			0,
			Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY)
		);
		const intersectionArea = intersectionW * intersectionH;

		if (intersectionArea <= 0) return false;

		const areaA = (boxA.maxX - boxA.minX) * (boxA.maxY - boxA.minY);
		const areaB = (boxB.maxX - boxB.minX) * (boxB.maxY - boxB.minY);
		const minArea = Math.min(areaA, areaB);

		return intersectionArea > minArea * 0.05;
	}

	function getStrokeList(ids: Set<string>): Stroke[] {
		const list: Stroke[] = [];
		for (const id of ids) {
			const s = strokes.get(id);
			if (s) list.push(s);
		}
		return list;
	}

	// --- API Processing ---

	async function processQueueItem(item: QueueItem) {
		isSending = true;

		const tracker = trackedClusters.get(item.clusterId);
		if (!tracker || tracker.strokeIds.size === 0) {
			analysisQueue = analysisQueue.filter((i) => i.id !== item.id);
			isSending = false;
			return;
		}

		// Show "Analyze this?" prompt
		item.status = 'awaiting';
		analysisQueue = [...analysisQueue];

		const askResult = await showAskHover(item.clusterId, tracker.bounds);

		if (askResult === 'no') {
			// User declined, remove from queue
			analysisQueue = analysisQueue.filter((i) => i.id !== item.id);
			isSending = false;
			return;
		}

		if (askResult === 'dismissed') {
			// User started drawing or timeout - mark as skipped
			tracker.skipped = true;
			analysisQueue = analysisQueue.filter((i) => i.id !== item.id);
			isSending = false;
			return;
		}

		// User clicked Yes, proceed with analysis
		item.status = 'sending';
		analysisQueue = [...analysisQueue];

		try {
			await new Promise((r) => setTimeout(r, SEND_DELAY));

			const ids = Array.from(tracker.strokeIds).sort();
			const image = await captureCanvasState(ids);

			const existingAnalysisId = tracker.analysisItemId;

			const response = await fetch('/api/analyze-group', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-client-id': clientId
				},
				body: JSON.stringify({
					image,
					groupId: item.clusterId,
					timestamp: item.timestamp
				})
			});

			if (response.status === 429) {
				console.warn('[AutoAnalysis] Throttled. Waiting 5s before retry.');
				item.status = 'pending';
				analysisQueue = [...analysisQueue];
				await new Promise((r) => setTimeout(r, 5000));
				isSending = false;
				return;
			}

			if (!response.ok) throw new Error(response.statusText);

			const data = (await response.json()) as {
				success: boolean;
				title?: string;
				content?: string;
				objectId?: string;
			};

			if (data.success && data.title && data.content) {
				let newAnalysisId: string;

				// If this cluster already has an analysis item, update it.
				// (findBestMatch already ensures we don't merge into items with feedback)
				if (existingAnalysisId) {
					updateAnalysisItem(
						existingAnalysisId,
						data.title,
						data.content,
						data.objectId,
						image,
						tracker.bounds
					);
					newAnalysisId = existingAnalysisId;
					console.log('[AutoAnalysis] Updated item:', existingAnalysisId);
				} else {
					newAnalysisId = addAnalysisItem(
						data.title,
						data.content,
						false,
						undefined,
						data.objectId,
						image,
						tracker.bounds
					);
					tracker.analysisItemId = newAnalysisId;
					console.log('[AutoAnalysis] Created item:', newAnalysisId);
				}

				// Show result hover with Yes/No feedback
				showResultHover(item.clusterId, newAnalysisId, tracker.bounds, data.title, data.content);
			}

			analysisQueue = analysisQueue.filter((i) => i.id !== item.id);
		} catch (e) {
			console.error('[AutoAnalysis] Error:', e);
			analysisQueue = analysisQueue.filter((i) => i.id !== item.id);
		} finally {
			isSending = false;
		}
	}

	async function captureCanvasState(activeStrokeIds: string[]): Promise<string> {
		const canvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('No Context');

		ctx.fillStyle = '#1e1e1e';
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		const activeSet = new Set(activeStrokeIds);

		for (const stroke of strokes.values()) {
			const isActive = activeSet.has(stroke.id);
			ctx.lineWidth = stroke.size;
			if (isActive) {
				ctx.strokeStyle = stroke.color;
				ctx.globalAlpha = 1.0;
			} else {
				ctx.strokeStyle = '#555555';
				ctx.globalAlpha = 0.2;
			}

			const pts = stroke.points;
			if (pts.length < 2) {
				if (pts.length === 1) {
					ctx.beginPath();
					ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
					ctx.fillStyle = ctx.strokeStyle;
					ctx.fill();
				}
				continue;
			}
			ctx.beginPath();
			ctx.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length - 1; i++) {
				const curr = pts[i];
				const next = pts[i + 1];
				const midX = (curr.x + next.x) / 2;
				const midY = (curr.y + next.y) / 2;
				ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
			}
			ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
			ctx.stroke();
		}
		const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}
</script>

<!-- Canvas Hover Notification -->
{#if canvasHover && canvasHover.visible}
	<div
		class="pointer-events-auto fixed z-50 rounded-lg border border-white/20 bg-black/80 px-3 py-2 shadow-xl backdrop-blur-sm"
		style="left: {canvasHover.position.x}px; top: {canvasHover.position.y}px;"
		transition:fade={{ duration: 200 }}
		onpointerenter={pauseHoverTimeout}
		onpointerleave={resumeHoverTimeout}
		role="dialog"
		tabindex="-1"
	>
		{#if canvasHover.type === 'ask'}
			<!-- Pre-Analysis Prompt -->
			<div class="flex items-center gap-3">
				<span class="text-sm text-white/80">Analyze?</span>
				<div class="flex gap-1">
					<button
						class="rounded-full p-1 text-green-400 transition-colors hover:bg-green-400/20"
						onclick={() => handleAskResponse('yes')}
						title="Yes"
						data-demo-id="hover-ask-yes-{canvasHover.clusterId}"
					>
						<CircleCheck size={18} />
					</button>
					<button
						class="rounded-full p-1 text-red-400 transition-colors hover:bg-red-400/20"
						onclick={() => handleAskResponse('no')}
						title="No"
						data-demo-id="hover-ask-no-{canvasHover.clusterId}"
					>
						<CircleX size={18} />
					</button>
				</div>
			</div>
		{:else if canvasHover.type === 'result'}
			<!-- Post-Analysis Result -->
			<div class="flex max-w-xs flex-col gap-2">
				<div class="text-sm font-medium text-white">{canvasHover.title}</div>
				<div class="line-clamp-2 text-xs text-white/60">{canvasHover.content}</div>
				<div class="flex items-center gap-2 border-t border-white/10 pt-2">
					<span class="text-xs text-white/50">Correct?</span>
					<div class="flex gap-1">
						<button
							class="rounded-full p-1 text-green-400 transition-colors hover:bg-green-400/20"
							onclick={() => handleResultFeedback('yes')}
							title="Yes"
							data-demo-id="hover-feedback-yes-{canvasHover.clusterId}"
						>
							<CircleCheck size={16} />
						</button>
						<button
							class="rounded-full p-1 text-red-400 transition-colors hover:bg-red-400/20"
							onclick={() => handleResultFeedback('no')}
							title="No"
							data-demo-id="hover-feedback-no-{canvasHover.clusterId}"
						>
							<CircleX size={16} />
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
