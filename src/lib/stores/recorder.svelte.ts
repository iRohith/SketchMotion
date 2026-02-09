import { type Stroke } from '$lib/types';

export type RecordedAction =
	| { type: 'stroke_added'; timestamp: number; stroke: Stroke }
	| { type: 'stroke_removed'; timestamp: number; strokeId: string };

export const recorder = $state({
	isRecording: false,
	startTime: 0,
	actions: [] as RecordedAction[]
});

export function startRecording() {
	recorder.isRecording = true;
	recorder.startTime = Date.now();
	recorder.actions = [];
	console.log('[Recorder] Started');
}

export function stopRecordingAndDownload() {
	recorder.isRecording = false;
	const endTime = Date.now();
	const duration = endTime - recorder.startTime;

	const data = {
		startTime: recorder.startTime,
		endTime,
		duration,
		actions: $state.snapshot(recorder.actions) // Use snapshot to get plain object
	};

	const json = JSON.stringify(data, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `recording-${new Date().toISOString()}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	console.log('[Recorder] Saved', recorder.actions.length, 'actions');
}

export function recordAction(action: RecordedAction) {
	if (!recorder.isRecording) return;
	// Calculate relative timestamp based on start time?
	// Or keep absolute? User asked for "time delays", relative is better for replay but absolute works too.
	// But let's just store the absolute timestamp in the action object itself as passed, and we can derive delays.
	// Actually, let's normalize the timestamp to be relative to start for cleaner JSON.

	const relativeAction = {
		...action,
		timestamp: Date.now() - recorder.startTime
	};
	recorder.actions.push(relativeAction);
}
