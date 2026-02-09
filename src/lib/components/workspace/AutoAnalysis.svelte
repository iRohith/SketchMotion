<script lang="ts">
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';
	import {
		strokes,
		groupState,
		calculateBoundingBox,
		groups,
		requestRender,
		canvasState
	} from '$lib/stores/canvas.svelte';
	import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';
	import {
		analysisResults,
		analysisHover,
		showAskHover,
		showResultHover,
		dismissHover,
		handleAskResponse,
		handleResultFeedback,
		pauseHoverTimeout,
		resumeHoverTimeout,
		registerAnalysisTrigger,
		unregisterAnalysisTrigger,
		registerFeedbackHandler,
		unregisterFeedbackHandler,
		addLoadingItem,
		setItemError,
		setItemSuccess,
		registerRetryHandler,
		unregisterRetryHandler,
		registerManualSelectionHandler,
		unregisterManualSelectionHandler,
		type FeedbackEvent
	} from '$lib/stores/analysis.svelte';
	import {
		autoAnalysisState,
		trackedClusters,
		clearDebounceTimer,
		setDebounceTimer,
		type QueueItem
	} from '$lib/stores/autoAnalysis.svelte';
	import { onMount } from 'svelte';
	import type { Stroke } from '$lib/types';
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import { CANVAS_HEIGHT, CANVAS_WIDTH } from '$lib/utils/constants';
	import { demoCursor } from '$lib/stores/demoCursor.svelte';
	import { toastState } from '$lib/stores/toast.svelte';

	// --- Configuration ---
	const IDLE_THRESHOLD = 1500;
	const MAX_RETRIES = 3;
	const SEND_DELAY = $derived(demoCursor.visible ? 200 : 1000);

	// --- State (from store) ---
	// Note: analysisQueue, isSending, lastSnapshotTime, trackedClusters now come from autoAnalysis store
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

	// Register manual trigger for demo mode and feedback handler
	onMount(() => {
		registerAnalysisTrigger(runAccumulation);
		registerFeedbackHandler(handleFeedbackEvent);
		registerRetryHandler(handleRetry);
		registerManualSelectionHandler(handleManualSelectionAnalysis);
		return () => {
			unregisterAnalysisTrigger();
			unregisterFeedbackHandler();
			unregisterRetryHandler();
			unregisterManualSelectionHandler();
		};
	});

	function handleManualSelectionAnalysis(selectedIds: Set<string>) {
		if (selectedIds.size === 0) return;
		console.log(
			'[AutoAnalysis] Manual selection analysis triggered for',
			selectedIds.size,
			'strokes'
		);

		// 1. Check if we already have a tracker for these strokes (exact or approximate)
		// For manual trigger, we want to analyze EXACTLY what is selected.
		// If there is an existing cluster that contains these strokes, we might use it,
		// but if the selection is different, we should probably treat it as a new intent.

		// Let's look for a cluster that significantly overlaps or is contained
		let targetClusterId: string | undefined;

		for (const [clusterId, tracker] of trackedClusters.entries()) {
			const intersection = new Set([...selectedIds].filter((x) => tracker.strokeIds.has(x)));
			const overlap = intersection.size / Math.max(selectedIds.size, tracker.strokeIds.size);

			if (overlap > 0.8) {
				// High overlap - reuse cluster
				targetClusterId = clusterId;
				break;
			}
		}

		if (targetClusterId) {
			// Update existing cluster
			const tracker = trackedClusters.get(targetClusterId)!;
			tracker.strokeIds = new Set(selectedIds);
			tracker.lastUpdate = Date.now();
			tracker.skipped = false;

			// Recalculate bounds
			const strokesList = getStrokeList(selectedIds);
			const bounds = calculateBoundingBox(strokesList);
			if (bounds) {
				tracker.bounds = {
					...bounds,
					width: bounds.width,
					height: bounds.height,
					centerX: bounds.centerX,
					centerY: bounds.centerY
				};
			}
		} else {
			// Create new cluster
			const strokesList = getStrokeList(selectedIds);
			const bounds = calculateBoundingBox(strokesList);
			if (!bounds) return;

			targetClusterId = crypto.randomUUID();
			trackedClusters.set(targetClusterId, {
				strokeIds: new Set(selectedIds),
				analysisItemId: null,
				bounds: {
					...bounds,
					width: bounds.width,
					height: bounds.height,
					centerX: bounds.centerX,
					centerY: bounds.centerY
				},
				lastUpdate: Date.now(),
				skipped: false,
				retryCount: 0
			});
		}

		// Queue for analysis with skipPrompt
		const queueItem: QueueItem = {
			id: `queue-${Date.now()}`,
			clusterId: targetClusterId,
			strokeIds: new Set(selectedIds),
			timestamp: Date.now(),
			status: 'pending',
			skipPrompt: true
		};

		// Remove any existing pending items for this cluster
		autoAnalysisState.analysisQueue = autoAnalysisState.analysisQueue.filter(
			(i) => i.clusterId !== targetClusterId
		);

		autoAnalysisState.analysisQueue.push(queueItem);
		autoAnalysisState.analysisQueue = [...autoAnalysisState.analysisQueue];

		processQueueItem(queueItem);
	}

	// Handle retry requests from the Analysis UI
	function handleRetry(itemId: string, clusterId: string) {
		console.log('[AutoAnalysis] Retry requested for:', clusterId);
		const tracker = trackedClusters.get(clusterId);
		if (!tracker) {
			console.warn('[AutoAnalysis] No tracker found for retry:', clusterId);
			return;
		}

		// Re-queue the analysis
		const queueItem: QueueItem = {
			id: `queue-${Date.now()}`,
			clusterId,
			strokeIds: tracker.strokeIds,
			timestamp: Date.now(),
			status: 'pending' as const
		};
		autoAnalysisState.analysisQueue.push(queueItem);
		autoAnalysisState.analysisQueue = [...autoAnalysisState.analysisQueue];

		// Process the queue item
		processQueueItem(queueItem);
	}

	// --- Effects ---

	// Handle feedback events from analysis store
	async function handleFeedbackEvent(event: FeedbackEvent) {
		console.log('[AutoAnalysis] Feedback received:', event);

		// Find the tracker for this analysis item
		let tracker: ReturnType<typeof trackedClusters.get> | undefined;
		let clusterId: string | undefined;

		for (const [cId, t] of trackedClusters.entries()) {
			if (t.analysisItemId === event.itemId) {
				tracker = t;
				clusterId = cId;
				break;
			}
		}

		if (!tracker || !clusterId) {
			console.warn('[AutoAnalysis] No tracker found for feedback item:', event.itemId);
			return;
		}

		if (event.feedback === 'yes' || event.feedback === 'other') {
			// User accepted - keep the AI-merged groups
			// Clear preAIMergeStrokeIds since merge is confirmed
			tracker.preAIMergeStrokeIds = undefined;
			console.log('[AutoAnalysis] User accepted analysis. Groups kept.');
		} else if (event.feedback === 'no') {
			// User rejected - revert to pre-AI groups
			if (tracker.preAIMergeStrokeIds) {
				tracker.strokeIds = tracker.preAIMergeStrokeIds;
				console.log('[AutoAnalysis] Reverted to pre-AI groups');
			}

			// Check if we can retry
			if (tracker.retryCount < MAX_RETRIES) {
				console.log(`[AutoAnalysis] Retrying analysis (${tracker.retryCount + 1}/${MAX_RETRIES})`);
				await retryAnalysis(clusterId, tracker, event);
			} else {
				console.log('[AutoAnalysis] Max retries reached. Giving up on this group.');
				toastState.info('Max retries reached. You can add custom feedback.');
			}
		}
	}

	// Retry analysis with feedback context
	async function retryAnalysis(
		clusterId: string,
		tracker: NonNullable<ReturnType<typeof trackedClusters.get>>,
		feedbackEvent: FeedbackEvent
	) {
		try {
			const { intentImage, contextImage, colorMapping } = await captureCanvasState(clusterId);
			const url = demoCursor.visible ? '/api/demo/analyze-group' : '/api/analyze-group';
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-client-id': demoCursor.visible ? 'DEMO_SESSION_123' : clientId
				},
				body: JSON.stringify({
					intentImage,
					contextImage,
					groupId: clusterId,
					existingGroups: colorMapping,
					sessionId: tracker.sessionId,
					feedback: feedbackEvent.feedback,
					feedbackText: feedbackEvent.text,
					previousTitle: tracker.lastTitle,
					isRetry: true,
					timestamp: Date.now()
				})
			});

			if (!response.ok) {
				throw new Error(response.statusText);
			}

			const data = (await response.json()) as {
				success: boolean;
				title?: string;
				content?: string;
				objectId?: string;
				sessionId?: string;
				retryCount?: number;
				canRetry?: boolean;
				error?: string;
			};

			// Update tracker with session data
			if (data.sessionId) tracker.sessionId = data.sessionId;
			if (data.retryCount !== undefined) tracker.retryCount = data.retryCount;

			if (data.success && data.title && data.content) {
				tracker.lastTitle = data.title;

				// Update the existing analysis item
				if (tracker.analysisItemId) {
					setItemSuccess(
						tracker.analysisItemId,
						data.title,
						data.content,
						data.objectId,
						intentImage,
						tracker.bounds,
						contextImage
					);
					console.log('[AutoAnalysis] Retry success:', data.title);
				}

				// Note: Don't show popup on retry - user already gave feedback
				// The item is updated in the sidebar, user can expand to see new result
			} else if (data.error) {
				console.error('[AutoAnalysis] Retry returned error:', data.error);
				if (tracker.analysisItemId) {
					setItemError(tracker.analysisItemId, data.error);
				}
			}
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : 'Unknown error';
			console.error('[AutoAnalysis] Retry exception:', errorMsg);
			if (tracker.analysisItemId) {
				setItemError(tracker.analysisItemId, 'Retry failed: ' + errorMsg);
			}
		}
	}

	// Trigger accumulation when last stroke update changes (after idle)
	// In demo mode, disable automatic triggering - only manual triggers via triggerAnalysisNow
	$effect(() => {
		const lastStrokeUpdate = canvasState.lastStrokeUpdate;
		if (lastStrokeUpdate <= 0) return;

		// In demo mode, skip automatic analysis - wait for manual trigger
		if (demoCursor.visible) {
			return;
		}

		clearDebounceTimer();

		setDebounceTimer(
			setTimeout(() => {
				runAccumulation();
			}, IDLE_THRESHOLD)
		);
		return () => {
			clearDebounceTimer();
		};
	});

	// Hide hover on drawing start - only reads isDrawing, uses untrack for analysisHover check
	$effect(() => {
		const isDrawing = canvasToolbarState.isDrawing;
		if (isDrawing) {
			untrack(() => {
				if (analysisHover.current) {
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
		const queueLength = autoAnalysisState.analysisQueue.length;
		const sending = autoAnalysisState.isSending;
		if (!sending && queueLength > 0) {
			untrack(() => {
				const pending = autoAnalysisState.analysisQueue.find((i) => i.status === 'pending');
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
			if (!analysisHover.current) return;

			const tracker = trackedClusters.get(analysisHover.current.clusterId);
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

	// --- Core Logic ---

	function runAccumulation() {
		if (strokes.size === 0) return;

		const currentGroupSets: Set<string>[] = Array.from(groups.values()).map((s) => new Set(s));
		if (currentGroupSets.length === 0) return;

		const spatialClusters = clusterSetsSpatially(currentGroupSets);

		let maxTimeFound = autoAnalysisState.lastSnapshotTime;

		for (const clusterStrokeIds of spatialClusters) {
			const clusterStrokes = getStrokeList(clusterStrokeIds);
			if (clusterStrokes.length === 0) continue;

			const bounds = calculateBoundingBox(clusterStrokes);
			if (!bounds) continue;

			let hasNewContent = false;
			if (demoCursor.visible) {
				hasNewContent = true;
			}
			for (const s of clusterStrokes) {
				const endT = s.points[s.points.length - 1]?.t || 0;
				if (endT > autoAnalysisState.lastSnapshotTime) {
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
						maxY: newBounds.maxY,
						width: newBounds.width,
						height: newBounds.height,
						centerX: newBounds.centerX,
						centerY: newBounds.centerY
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
						maxY: bounds.maxY,
						width: bounds.width,
						height: bounds.height,
						centerX: bounds.centerX,
						centerY: bounds.centerY
					},
					lastUpdate: Date.now(),
					skipped: false,
					retryCount: 0
				});

				if (hasNewContent) {
					queueCluster(newClusterId, clusterStrokeIds);
				}
			}
		}

		autoAnalysisState.lastSnapshotTime = maxTimeFound;
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
		const existingQ = autoAnalysisState.analysisQueue.find(
			(q) => q.clusterId === clusterId && (q.status === 'pending' || q.status === 'awaiting')
		);
		if (existingQ) {
			existingQ.strokeIds = strokeIds;
			existingQ.timestamp = Date.now();
			autoAnalysisState.analysisQueue = [...autoAnalysisState.analysisQueue];
		} else {
			autoAnalysisState.analysisQueue = [
				...autoAnalysisState.analysisQueue,
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
		autoAnalysisState.isSending = true;

		const tracker = trackedClusters.get(item.clusterId);
		if (!tracker || tracker.strokeIds.size === 0) {
			autoAnalysisState.analysisQueue = autoAnalysisState.analysisQueue.filter(
				(i) => i.id !== item.id
			);
			autoAnalysisState.isSending = false;
			return;
		}

		let askResult: 'yes' | 'no' | 'dismissed' = 'yes';

		if (!item.skipPrompt) {
			// Show "Analyze this?" prompt
			item.status = 'awaiting';
			autoAnalysisState.analysisQueue = [...autoAnalysisState.analysisQueue];

			// Wait for 100ms to ensure UI updates before showing hover (optional, but good practice)
			await new Promise((r) => setTimeout(r, 100));

			askResult = await showAskHover(item.clusterId, tracker.bounds);
		}

		if (askResult === 'no') {
			// User declined, remove from queue
			autoAnalysisState.analysisQueue = autoAnalysisState.analysisQueue.filter(
				(i) => i.id !== item.id
			);
			autoAnalysisState.isSending = false;
			return;
		}

		if (askResult === 'dismissed') {
			// User started drawing or timeout - mark as skipped
			tracker.skipped = true;
			autoAnalysisState.analysisQueue = autoAnalysisState.analysisQueue.filter(
				(i) => i.id !== item.id
			);
			autoAnalysisState.isSending = false;
			return;
		}

		// User clicked Yes, proceed with analysis
		item.status = 'sending';
		autoAnalysisState.analysisQueue = [...autoAnalysisState.analysisQueue];

		try {
			await new Promise((r) => setTimeout(r, SEND_DELAY));

			const { intentImage, contextImage, colorMapping } = await captureCanvasState(item.clusterId);

			// Create loading item immediately (or use existing one)
			let analysisId = tracker.analysisItemId;

			// Check if item actually exists in store
			const existingItem = analysisId
				? analysisResults.items.find((i) => i.id === analysisId)
				: null;

			if (!existingItem) {
				analysisId = addLoadingItem(item.clusterId, tracker.bounds);
				tracker.analysisItemId = analysisId;
			} else {
				// Update existing item to loading state
				existingItem.status = 'loading';
				existingItem.title = 'Analyzing...';
				// Reset feedback
				existingItem.feedback = null;
				existingItem.feedbackText = '';
				// Highlight it
				analysisResults.highlightedItemId = analysisId;
			}

			// Save current stroke IDs before any AI-suggested merge
			if (!tracker.preAIMergeStrokeIds) {
				tracker.preAIMergeStrokeIds = new Set(tracker.strokeIds);
			}

			// Log: Sending request
			console.log(
				`[AutoAnalysis] Sending: cluster=${item.clusterId}, groups=${colorMapping.length}, intentSize=${Math.round(intentImage.length / 1024)}KB`
			);

			const url = demoCursor.visible ? '/api/demo/analyze-group' : '/api/analyze-group';
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-client-id': demoCursor.visible ? 'DEMO_SESSION_123' : clientId
				},
				body: JSON.stringify({
					intentImage,
					contextImage,
					groupId: item.clusterId,
					existingGroups: colorMapping,
					sessionId: tracker.sessionId,
					timestamp: item.timestamp
				})
			});

			if (response.status === 429) {
				console.warn('[AutoAnalysis] Throttled. Waiting 5s before retry.');
				if (analysisId) setItemError(analysisId, 'Rate limited. Retrying...');
				item.status = 'pending';
				autoAnalysisState.analysisQueue = [...autoAnalysisState.analysisQueue];
				await new Promise((r) => setTimeout(r, 5000));
				autoAnalysisState.isSending = false;
				return;
			}

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { error?: string };
				const errorMsg = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
				console.error(`[AutoAnalysis] Response error: ${errorMsg}`);
				if (analysisId) setItemError(analysisId, errorMsg);
				autoAnalysisState.analysisQueue = autoAnalysisState.analysisQueue.filter(
					(i) => i.id !== item.id
				);
				return;
			}

			console.log('[AutoAnalysis] Response received, parsing...');

			const data = (await response.json()) as {
				success: boolean;
				title?: string;
				content?: string;
				objectId?: string;
				sessionId?: string;
				retryCount?: number;
				canRetry?: boolean;
				suggestedGroups?: {
					name: string;
					description: string;
					groupIds: string[];
					confidence: number;
				}[];
			};

			// Save session data for future requests
			if (data.sessionId) {
				tracker.sessionId = data.sessionId;
			}
			if (data.retryCount !== undefined) {
				tracker.retryCount = data.retryCount;
			}

			if (data.success && data.title && data.content) {
				// Save title for potential feedback
				tracker.lastTitle = data.title;

				// Handle AI-suggested group merges first (so we can update bounds)
				if (data.suggestedGroups && data.suggestedGroups.length > 0) {
					console.log('[AutoAnalysis] AI suggested groups:', data.suggestedGroups);
					for (const suggestion of data.suggestedGroups) {
						if (suggestion.confidence >= 0.8) {
							console.log(`[AutoAnalysis] High-confidence group suggestion: "${suggestion.name}"`);
							// Merge the suggested groups' strokes
							const mergedStrokeIds = new Set<string>();
							for (const gId of suggestion.groupIds) {
								const existingGroup = groups.get(gId);
								if (existingGroup) {
									existingGroup.forEach((id) => mergedStrokeIds.add(id));
								}
							}
							// Update the tracker to include all merged strokes
							if (mergedStrokeIds.size > 0) {
								tracker.strokeIds = mergedStrokeIds;
								console.log(
									`[AutoAnalysis] Merged ${suggestion.groupIds.length} groups into tracker`
								);
							}
						}
					}
				}

				// Recalculate bounds based on the (potentially merged) stroke IDs
				const mergedStrokes = Array.from(tracker.strokeIds)
					.map((id) => strokes.get(id))
					.filter((s): s is Stroke => s !== undefined);
				const updatedBounds = calculateBoundingBox(mergedStrokes);
				if (updatedBounds) {
					tracker.bounds = updatedBounds;
				}

				// Update the analysis item to success with new bounds
				if (analysisId) {
					setItemSuccess(
						analysisId,
						data.title,
						data.content,
						data.objectId,
						intentImage,
						tracker.bounds,
						contextImage
					);
					console.log('[AutoAnalysis] Updated item to success:', analysisId);

					// Show result hover with Yes/No feedback
					showResultHover(item.clusterId, analysisId, tracker.bounds, data.title, data.content);
				}
			} else {
				// API returned success:false or missing data
				if (analysisId) setItemError(analysisId, 'Analysis returned no results');
			}

			autoAnalysisState.analysisQueue = autoAnalysisState.analysisQueue.filter(
				(i) => i.id !== item.id
			);
		} catch (e) {
			console.error('[AutoAnalysis] Error:', e);

			// Update item to error state
			let errorMessage = 'Analysis failed';
			if (e instanceof Error) {
				if (e.message.includes('quota')) {
					errorMessage = 'API quota exceeded. Please try again later.';
				} else if (e.message.includes('rate limit')) {
					errorMessage = 'Rate limit exceeded. Please wait 30 seconds.';
				} else if (e.message.includes('API key')) {
					errorMessage = 'Invalid API key. Please check configuration.';
				} else if (e.message.includes('Failed to fetch')) {
					errorMessage = 'Network error. Please check your connection.';
				}
			}

			// If we created a loading item, update it to error
			if (tracker.analysisItemId) {
				setItemError(tracker.analysisItemId, errorMessage);
			} else {
				toastState.error(errorMessage);
			}

			autoAnalysisState.analysisQueue = autoAnalysisState.analysisQueue.filter(
				(i) => i.id !== item.id
			);
		} finally {
			autoAnalysisState.isSending = false;
		}
	}
	// Capture canvas with two images for two-pass analysis:
	// 1. Intent Image: Pure drawing with target group highlighted, others dimmed
	// 2. Context Image: All strokes with colored outlines for group relationships
	interface CaptureResult {
		intentImage: string; // Pure drawing, target highlighted
		contextImage: string; // With group outlines
		colorMapping: { color: string; groupId: string; strokeIds: string[] }[];
	}

	async function captureCanvasState(targetClusterId?: string): Promise<CaptureResult> {
		const canvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
		const ctx = canvas.getContext('2d')!;

		// Build color mapping for groups
		const groupColors = generateGroupColors(groups.size);
		const colorMapping: { color: string; groupId: string; strokeIds: string[] }[] = [];
		const strokeToColor = new Map<string, string>();
		const targetStrokeIds = new Set<string>();

		// If the target cluster is tracked, use its strokes as the target
		// This handles both auto-analysis clusters and manual selections
		if (targetClusterId && trackedClusters.has(targetClusterId)) {
			const tracker = trackedClusters.get(targetClusterId);
			if (tracker) {
				tracker.strokeIds.forEach((id) => targetStrokeIds.add(id));
			}
		}

		console.log(
			'[CaptureCanvasState] targetClusterId:',
			targetClusterId,
			'groups.size:',
			groups.size,
			'tracked target strokes:',
			targetStrokeIds.size
		);

		// Reserve one color specifically for the target group
		const targetColor = 'hsl(300, 100%, 50%)'; // Magenta for target

		let colorIndex = 0;
		for (const [groupId, groupStrokeIds] of groups.entries()) {
			const color = groupColors[colorIndex % groupColors.length];

			// Check if this group is PART of the target selection (for manual selection case)
			// BUT: We want strict behavior:
			// If we have a target tracked cluster, any stroke in it gets the target color.
			// Any stroke NOT in it gets the group color.

			const strokeIdsList = Array.from(groupStrokeIds);

			// For manual selection, we might split existing groups.
			// We only want to report the non-targeted parts as "existing groups" to avoid confusion.
			const nonTargetIds = strokeIdsList.filter((id) => !targetStrokeIds.has(id));

			if (nonTargetIds.length > 0) {
				colorMapping.push({
					color,
					groupId,
					strokeIds: nonTargetIds
				});
			} else {
				// Even if empty (fully consumed by target), we might want to keep the group entry
				// to signal "this group is being analyzed", but let's prioritize the target grouping.
			}

			for (const strokeId of groupStrokeIds) {
				// If this stroke is part of our target selection, force it to have the target color
				if (targetStrokeIds.has(strokeId)) {
					strokeToColor.set(strokeId, targetColor);
				} else {
					strokeToColor.set(strokeId, color);
				}

				// Fallback logic for legacy/direct group matching
				if (targetStrokeIds.size === 0 && groupId === targetClusterId) {
					targetStrokeIds.add(strokeId);
					strokeToColor.set(strokeId, targetColor);
				}
			}
			colorIndex++;
		}

		// Add the target cluster as a single group in color mapping if we have target strokes
		if (targetStrokeIds.size > 0) {
			colorMapping.push({
				color: targetColor,
				groupId: targetClusterId || 'manual-selection',
				strokeIds: Array.from(targetStrokeIds)
			});
		}

		console.log(
			'[CaptureCanvasState] targetStrokeIds.size:',
			targetStrokeIds.size,
			'total strokes:',
			strokes.size
		);

		// Helper function to draw strokes
		const drawStrokes = (
			context: OffscreenCanvasRenderingContext2D,
			strokeList: Iterable<Stroke>,
			options: {
				opacity?: number;
				useOutline?: boolean;
				outlineColor?: (id: string) => string | undefined;
			}
		) => {
			for (const stroke of strokeList) {
				const alpha = options.opacity ?? 1.0;
				context.globalAlpha = alpha;

				// Draw outline if requested
				if (options.useOutline) {
					const outlineColor = options.outlineColor?.(stroke.id);
					if (outlineColor) {
						context.strokeStyle = outlineColor;
						context.lineWidth = stroke.size + 8;
						drawStrokePath(context, stroke);
					}
				}

				// Draw actual stroke
				context.globalAlpha = alpha;
				context.strokeStyle = stroke.color;
				context.lineWidth = stroke.size;
				drawStrokePath(context, stroke);
			}
		};

		const drawStrokePath = (context: OffscreenCanvasRenderingContext2D, stroke: Stroke) => {
			const pts = stroke.points;
			if (pts.length < 2) {
				if (pts.length === 1) {
					context.beginPath();
					context.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
					context.fillStyle = context.strokeStyle as string;
					context.fill();
				}
				return;
			}
			context.beginPath();
			context.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length - 1; i++) {
				const curr = pts[i];
				const next = pts[i + 1];
				const midX = (curr.x + next.x) / 2;
				const midY = (curr.y + next.y) / 2;
				context.quadraticCurveTo(curr.x, curr.y, midX, midY);
			}
			context.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
			context.stroke();
		};

		// === INTENT IMAGE ===
		// Pure drawing with target strokes highlighted, others dimmed
		ctx.fillStyle = '#1e1e1e';
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// Draw non-target strokes dimmed
		const nonTargetStrokes = Array.from(strokes.values()).filter((s) => !targetStrokeIds.has(s.id));
		const targetStrokes = Array.from(strokes.values()).filter((s) => targetStrokeIds.has(s.id));

		// If no target specified, show all at full opacity
		if (targetStrokeIds.size === 0) {
			drawStrokes(ctx, strokes.values(), { opacity: 1.0 });
		} else {
			// Calculate bounding box for target strokes
			const targetStrokeList = Array.from(strokes.values()).filter((s) =>
				targetStrokeIds.has(s.id)
			);
			const bbox = calculateBoundingBox(targetStrokeList);

			if (bbox) {
				// Draw Highlight Rectangle
				ctx.save();
				ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)'; // Purple border
				ctx.lineWidth = 2;
				ctx.fillStyle = 'rgba(168, 85, 247, 0.15)'; // Translucent purple fill
				ctx.beginPath();
				ctx.rect(bbox.minX - 10, bbox.minY - 10, bbox.width + 20, bbox.height + 20);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			// Dimmed background strokes
			drawStrokes(ctx, nonTargetStrokes, { opacity: 0.25 });
			// Target strokes at full opacity
			drawStrokes(ctx, targetStrokes, { opacity: 1.0 });
		}

		const intentBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
		const intentImage = await blobToDataURL(intentBlob);

		// === CONTEXT IMAGE ===
		// All strokes with colored outlines for group relationships
		ctx.fillStyle = '#1e1e1e';
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		// First pass: Highlight Rectangle for context reference
		if (targetStrokeIds.size > 0) {
			const targetStrokeList = Array.from(strokes.values()).filter((s) =>
				targetStrokeIds.has(s.id)
			);
			const bbox = calculateBoundingBox(targetStrokeList);

			if (bbox) {
				ctx.save();
				ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
				ctx.lineWidth = 2;
				ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
				ctx.beginPath();
				ctx.rect(bbox.minX - 10, bbox.minY - 10, bbox.width + 20, bbox.height + 20);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}
		}

		// Second pass: Draw colored outlines
		ctx.globalAlpha = 0.7;
		for (const stroke of strokes.values()) {
			const outlineColor = strokeToColor.get(stroke.id);
			if (!outlineColor) continue;

			ctx.strokeStyle = outlineColor;
			ctx.lineWidth = stroke.size + 8;
			drawStrokePath(ctx, stroke);
		}

		// Second pass: Draw actual strokes on top
		ctx.globalAlpha = 1.0;
		for (const stroke of strokes.values()) {
			ctx.strokeStyle = stroke.color;
			ctx.lineWidth = stroke.size;
			drawStrokePath(ctx, stroke);
		}

		const contextBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
		const contextImage = await blobToDataURL(contextBlob);

		return { intentImage, contextImage, colorMapping };
	}

	async function blobToDataURL(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	// Generate distinct colors for group outlines
	function generateGroupColors(count: number): string[] {
		const colors: string[] = [];
		const hueStep = 360 / Math.max(count, 1);

		for (let i = 0; i < count; i++) {
			const hue = (i * hueStep) % 360;
			colors.push(`hsl(${hue}, 80%, 60%)`);
		}

		return colors;
	}
</script>

<!-- Canvas Hover Notification -->
{#if analysisHover.current && analysisHover.current.visible}
	<div
		class="pointer-events-auto fixed z-50 rounded-lg border border-white/20 bg-black/80 px-3 py-2 shadow-xl backdrop-blur-sm"
		style="left: {analysisHover.current.position.x}px; top: {analysisHover.current.position.y}px;"
		transition:fade={{ duration: 200 }}
		onpointerenter={pauseHoverTimeout}
		onpointerleave={resumeHoverTimeout}
		role="dialog"
		tabindex="-1"
	>
		{#if analysisHover.current.type === 'ask'}
			<!-- Pre-Analysis Prompt -->
			<div class="flex items-center gap-3">
				<span class="text-sm text-white/80">Analyze?</span>
				<div class="flex gap-1">
					<button
						class="rounded-full p-1 text-green-400 transition-colors hover:bg-green-400/20"
						onclick={() => handleAskResponse('yes')}
						title="Yes"
						data-demo-id="hover-ask-yes-{analysisHover.current.clusterId}"
					>
						<CircleCheck size={18} />
					</button>
					<button
						class="rounded-full p-1 text-red-400 transition-colors hover:bg-red-400/20"
						onclick={() => handleAskResponse('no')}
						title="No"
						data-demo-id="hover-ask-no-{analysisHover.current.clusterId}"
					>
						<CircleX size={18} />
					</button>
				</div>
			</div>
		{:else if analysisHover.current.type === 'result'}
			<div class="flex max-w-xs min-w-50 flex-col gap-2">
				<!-- Post-Analysis Result -->
				<div class="flex flex-col gap-2">
					<div class="flex items-start justify-between">
						<div class="text-sm font-medium text-white">{analysisHover.current.title}</div>
						<button
							class="-mt-1 -mr-1 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white"
							onclick={() => dismissHover('dismissed')}
						>
							<CircleX size={14} />
						</button>
					</div>
					<div class="line-clamp-2 text-xs text-white/60">{analysisHover.current.content}</div>
					<div class="flex items-center gap-2 border-t border-white/10 pt-2">
						<span class="text-xs text-white/50">Correct?</span>
						<div class="flex gap-1">
							<button
								class="rounded-full p-1 text-green-400 transition-colors hover:bg-green-400/20"
								onclick={() => handleResultFeedback('yes')}
								title="Yes"
								data-demo-id="hover-feedback-yes-{analysisHover.current.clusterId}"
							>
								<CircleCheck size={16} />
							</button>
							<button
								class="rounded-full p-1 text-red-400 transition-colors hover:bg-red-400/20"
								onclick={() => handleResultFeedback('no')}
								title="No"
								data-demo-id="hover-feedback-no-{analysisHover.current.clusterId}"
							>
								<CircleX size={16} />
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
