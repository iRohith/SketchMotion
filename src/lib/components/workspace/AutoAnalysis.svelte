<script lang="ts">
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
		analysisResults
	} from '$lib/stores/analysis.svelte';
	import type { Stroke } from '$lib/types';

	type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };

	// Local queue item for tracking analysis requests
	type QueueItem = {
		id: string;
		clusterId: string;
		strokeIds: Set<string>;
		timestamp: number;
		status: 'pending' | 'sending' | 'sent';
	};

	// Tracked cluster keeps track of stroke groups sent for analysis
	type TrackedCluster = {
		strokeIds: Set<string>;
		analysisItemId: string | null;
		bounds: BoundingBox;
		lastUpdate: number;
	};

	// --- Configuration ---
	const IDLE_THRESHOLD = 3000; // Wait 3s of idle before processing
	const SEND_DELAY = 1000; // Delay between API calls
	const CANVAS_WIDTH = 1920;
	const CANVAS_HEIGHT = 1080;

	// --- State ---
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let analysisQueue = $state<QueueItem[]>([]);
	let isSending = $state(false);
	let lastSnapshotTime = 0;

	// Map of ClusterId -> TrackedCluster
	// Each TrackedCluster represents a set of strokes that have been (or will be) analyzed together.
	let trackedClusters = new Map<string, TrackedCluster>();

	// --- Effects ---

	// Trigger accumulation when groups change (after idle)
	$effect(() => {
		if (groupState.version < 0) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			runAccumulation();
		}, IDLE_THRESHOLD);
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	});

	// Highlight strokes on canvas when hovering analysis item
	$effect(() => {
		const hoveredId = analysisResults.hoveredItemId;
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
				if (canvasToolbarState.highlightedStrokeIds.size > 0) {
					canvasToolbarState.highlightedStrokeIds = new Set();
					requestRender();
				}
			}
		} else {
			if (canvasToolbarState.highlightedStrokeIds.size > 0) {
				canvasToolbarState.highlightedStrokeIds = new Set();
				requestRender();
			}
		}
	});

	// Process queue
	$effect(() => {
		if (!isSending && analysisQueue.length > 0) {
			const pending = analysisQueue.find((i) => i.status === 'pending');
			if (pending) {
				processQueueItem(pending);
			}
		}
	});

	// --- Core Logic ---

	/**
	 * Main accumulation function.
	 * 1. Gets current stroke groups from the canvas.
	 * 2. Merges spatially/temporally close groups.
	 * 3. Matches these clusters to existing tracked clusters using a scoring system.
	 * 4. Queues modified clusters for analysis.
	 */
	function runAccumulation() {
		if (strokes.size === 0) return;

		// Get current groups from canvas grouping algorithm
		const currentGroupSets: Set<string>[] = Array.from(groups.values()).map((s) => new Set(s));
		if (currentGroupSets.length === 0) return;

		// Step 1: Cluster spatially/temporally close groups
		const spatialClusters = clusterSetsSpatially(currentGroupSets);

		let maxTimeFound = lastSnapshotTime;

		for (const clusterStrokeIds of spatialClusters) {
			const clusterStrokes = getStrokeList(clusterStrokeIds);
			if (clusterStrokes.length === 0) continue;

			const bounds = calculateBoundingBox(clusterStrokes);
			if (!bounds) continue;

			// Check if this cluster has new content
			let hasNewContent = false;
			for (const s of clusterStrokes) {
				const endT = s.points[s.points.length - 1]?.t || 0;
				if (endT > lastSnapshotTime) {
					hasNewContent = true;
				}
				if (endT > maxTimeFound) maxTimeFound = endT;
			}

			// Step 2: Find best matching tracked cluster using scoring
			const matchResult = findBestMatch(clusterStrokeIds, bounds);

			if (matchResult.clusterId) {
				// Merge into existing cluster
				const tracker = trackedClusters.get(matchResult.clusterId)!;

				// CRITICAL: Merge stroke IDs, don't replace
				const mergedIds = new Set([...tracker.strokeIds, ...clusterStrokeIds]);
				tracker.strokeIds = mergedIds;

				// Update bounds to encompass all strokes
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

				// Queue for re-analysis if there's new content
				if (hasNewContent) {
					queueCluster(matchResult.clusterId, mergedIds);
				}
			} else {
				// Create new cluster
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
					lastUpdate: Date.now()
				});

				// Queue for analysis
				if (hasNewContent) {
					queueCluster(newClusterId, clusterStrokeIds);
				}
			}
		}

		lastSnapshotTime = maxTimeFound;
	}

	/**
	 * Finds the best matching tracked cluster for a new set of strokes.
	 * Returns null if no good match is found (meaning a new cluster should be created).
	 */
	function findBestMatch(
		newStrokeIds: Set<string>,
		newBounds: BoundingBox
	): { clusterId: string | null; score: number } {
		let bestClusterId: string | null = null;
		let bestScore = -Infinity;

		const SPATIAL_WEIGHT = 1.0;
		const TEMPORAL_WEIGHT = 0.5;
		const ANALYZED_PENALTY = 0.7; // Penalty for already analyzed
		const FEEDBACK_PENALTY = 100; // Effectively block merging

		const newTimeRange = getTimeRange(newStrokeIds);
		const newArea = (newBounds.maxX - newBounds.minX) * (newBounds.maxY - newBounds.minY);

		for (const [clusterId, tracker] of trackedClusters.entries()) {
			// 1. Spatial Score: How much of the new strokes overlaps with existing?
			const overlap = calculateOverlapArea(newBounds, tracker.bounds);
			const overlapRatio = newArea > 0 ? overlap / newArea : 0;

			// Skip if very little overlap
			if (overlapRatio < 0.1) continue;

			// 2. Temporal Score: How recent was the last update?
			const timeGap = Math.max(0, newTimeRange.min - tracker.lastUpdate);
			const temporalScore = Math.max(0, 1 - timeGap / 5000); // Decay over 5s

			// 3. Penalty for already analyzed groups
			let penalty = 0;
			if (tracker.analysisItemId) {
				const item = analysisResults.items.find((i) => i.id === tracker.analysisItemId);
				if (item) {
					if (item.feedback) {
						// User gave feedback, don't touch this cluster
						penalty = FEEDBACK_PENALTY;
					} else {
						penalty = ANALYZED_PENALTY;
					}
				}
			}

			const totalScore = overlapRatio * SPATIAL_WEIGHT + temporalScore * TEMPORAL_WEIGHT - penalty;

			if (totalScore > bestScore) {
				bestScore = totalScore;
				bestClusterId = clusterId;
			}
		}

		// Threshold: Only match if score is reasonably good
		if (bestScore > 0.3) {
			return { clusterId: bestClusterId, score: bestScore };
		}
		return { clusterId: null, score: 0 };
	}

	/**
	 * Adds a cluster to the analysis queue.
	 * If the cluster is already pending in the queue, updates it instead.
	 */
	function queueCluster(clusterId: string, strokeIds: Set<string>) {
		const existingQ = analysisQueue.find(
			(q) => q.clusterId === clusterId && q.status === 'pending'
		);
		if (existingQ) {
			existingQ.strokeIds = strokeIds;
			existingQ.timestamp = Date.now();
			analysisQueue = [...analysisQueue]; // Trigger reactivity
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

	/**
	 * Clusters stroke groups spatially and temporally.
	 * Groups that are close in space AND time get merged.
	 */
	function clusterSetsSpatially(sets: Set<string>[]): Set<string>[] {
		const clusters = sets.map((s) => new Set(s));
		let merged = true;
		while (merged) {
			merged = false;
			for (let i = 0; i < clusters.length; i++) {
				if (clusters[i].size === 0) continue;
				for (let j = i + 1; j < clusters.length; j++) {
					if (clusters[j].size === 0) continue;

					// Temporal check
					const rangeA = getTimeRange(clusters[i]);
					const rangeB = getTimeRange(clusters[j]);
					const gap = Math.max(0, rangeB.min - rangeA.max, rangeA.min - rangeB.max);

					// If too far apart in time, don't merge
					if (gap > 3000) continue;

					// Spatial check
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

	function calculateOverlapArea(boxA: BoundingBox, boxB: BoundingBox): number {
		const xOverlap = Math.max(0, Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX));
		const yOverlap = Math.max(0, Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY));
		return xOverlap * yOverlap;
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

		// Require significant overlap
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
		item.status = 'sending';
		analysisQueue = [...analysisQueue];

		try {
			await new Promise((r) => setTimeout(r, SEND_DELAY));

			const tracker = trackedClusters.get(item.clusterId);
			if (!tracker || tracker.strokeIds.size === 0) {
				analysisQueue = analysisQueue.filter((i) => i.id !== item.id);
				return;
			}

			// IMPORTANT: Use tracker's strokeIds, not item's (tracker has the merged set)
			const ids = Array.from(tracker.strokeIds).sort();
			const image = await captureCanvasState(ids);

			const existingAnalysisId = tracker.analysisItemId;

			// Check if we should update or create new
			let shouldCreateNew = false;
			if (existingAnalysisId) {
				const existingItem = analysisResults.items.find((i) => i.id === existingAnalysisId);
				if (existingItem?.feedback) {
					// Has feedback, create new item instead
					shouldCreateNew = true;
				}
			}

			const response = await fetch('/api/analyze-group', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					image,
					groupId: item.clusterId,
					timestamp: item.timestamp
				})
			});

			if (response.status === 429) {
				console.warn('[AutoAnalysis] Throttled. Waiting 5s before retry.');
				// Put back to pending and wait
				item.status = 'pending';
				analysisQueue = [...analysisQueue];
				await new Promise((r) => setTimeout(r, 5000));
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
				if (existingAnalysisId && !shouldCreateNew) {
					updateAnalysisItem(
						existingAnalysisId,
						data.title,
						data.content,
						data.objectId,
						image,
						tracker.bounds
					);
					console.log('[AutoAnalysis] Updated item:', existingAnalysisId);
				} else {
					const newId = addAnalysisItem(
						data.title,
						data.content,
						false,
						undefined,
						data.objectId,
						image,
						tracker.bounds
					);
					tracker.analysisItemId = newId;
					console.log('[AutoAnalysis] Created item:', newId);
				}
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
