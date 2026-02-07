<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		strokes,
		groups,
		strokeGroupMap,
		groupState,
		requestRender
	} from '$lib/stores/canvas.svelte';
	import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';
	import { analysisResults } from '$lib/stores/analysis.svelte';
	import {
		autoAnalysisState,
		trackedClusters,
		type QueueItem
	} from '$lib/stores/autoAnalysis.svelte';
	import {
		saveWorkspaceDebounced,
		loadWorkspace,
		getOrCreateSessionId,
		type WorkspaceState
	} from '$lib/stores/persistence';

	import { toastState } from '$lib/stores/toast.svelte';

	let isLoaded = $state(false);

	onMount(() => {
		try {
			// Initialize session ID
			getOrCreateSessionId();

			const saved = loadWorkspace();
			if (saved) {
				console.log('[SessionManager] Loading saved workspace...', saved.sessionId);

				// 1. Restore Strokes
				strokes.clear();
				if (saved.strokes instanceof Map) {
					for (const [id, stroke] of saved.strokes) {
						strokes.set(id, stroke);
					}
				}

				// 2. Restore Groups
				// Note: complex Maps/Sets are restored by reviver in persistence.ts
				groups.clear();
				if (saved.groups instanceof Map) {
					for (const [id, set] of saved.groups) {
						groups.set(id, set);
					}
				}

				strokeGroupMap.clear();
				if (saved.strokeGroupMap instanceof Map) {
					for (const [sId, gId] of saved.strokeGroupMap) {
						strokeGroupMap.set(sId, gId);
					}
				}

				if (saved.groupStateVersion) {
					groupState.version = saved.groupStateVersion;
				}

				// 3. Restore Analysis Results
				if (Array.isArray(saved.analysisItems)) {
					analysisResults.items = saved.analysisItems;
				}

				// 4. Restore Auto-Analysis State
				trackedClusters.clear();
				if (saved.trackedClusters instanceof Map) {
					for (const [id, cluster] of saved.trackedClusters) {
						trackedClusters.set(id, cluster);
					}
				}
				if (saved.autoAnalysis) {
					if (saved.autoAnalysis.lastSnapshotTime) {
						autoAnalysisState.lastSnapshotTime = saved.autoAnalysis.lastSnapshotTime;
					}
					if (Array.isArray(saved.autoAnalysis.analysisQueue)) {
						autoAnalysisState.analysisQueue = saved.autoAnalysis.analysisQueue.map(
							(item: QueueItem) => ({
								...item,
								status: item.status === 'sending' ? 'pending' : item.status
							})
						);
					}
				}

				// 5. Restore Toolbar/Settings
				if (saved.canvasToolbar) {
					// Merge carefully
					Object.assign(canvasToolbarState, saved.canvasToolbar);
				}

				console.log('[SessionManager] Workspace loaded successfully');
				toastState.success('Session restored');
				requestRender();
			} else {
				console.log('[SessionManager] No saved session found, starting fresh');
			}
		} catch (e) {
			console.error('[SessionManager] Failed to load session:', e);
			toastState.error('Failed to restore session');
		} finally {
			// Mark as loaded effectively immediately so subsequent changes trigger saves
			// Use tick to ensure hydration is "done"
			tick().then(() => {
				isLoaded = true;
			});
		}
	});

	// Auto-Save Effect
	$effect(() => {
		if (!isLoaded) return;

		// Track dependencies
		// Track dependencies
		void groupState.version; // Strokes/Groups changed
		void analysisResults.items; // Analysis items changed
		void canvasToolbarState.mode; // Detailed toolbar changes
		void canvasToolbarState.activeLayer;
		void autoAnalysisState.lastSnapshotTime; // Auto-analysis progress

		// We assume trackedClusters changes often accompany other changes or are less critical to save instantly
		// But strictly, we should track them. Since simple Map isn't reactive, we rely on correlated updates.

		// Construct state
		const state: WorkspaceState = {
			sessionId: getOrCreateSessionId(),
			timestamp: Date.now(),
			clientIds: '',
			strokes: strokes,
			groups: groups,
			strokeGroupMap: strokeGroupMap,
			groupStateVersion: groupState.version,
			analysisItems: $state.snapshot(analysisResults.items), // Use snapshot to avoid proxy issues if any
			trackedClusters: trackedClusters,
			canvasToolbar: $state.snapshot(canvasToolbarState),
			autoAnalysis: $state.snapshot(autoAnalysisState)
		};

		saveWorkspaceDebounced(state);
	});
</script>
