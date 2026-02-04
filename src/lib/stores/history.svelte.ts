import type { Stroke } from '$lib/types';

type StrokeSnapshot = Stroke[];

type HistoryState = {
	undo: StrokeSnapshot[];
	redo: StrokeSnapshot[];
	lastKey: string;
	maxDepth: number;
};

let historyState: HistoryState = $state.raw({
	undo: [],
	redo: [],
	lastKey: '',
	maxDepth: 50
});

function cloneStroke(stroke: Stroke): Stroke {
	return {
		...stroke,
		points: stroke.points.map((p) => ({ ...p })),
		transform: stroke.transform ? { ...stroke.transform } : undefined,
		bounding: stroke.bounding ? { ...stroke.bounding } : undefined,
		corners: stroke.corners ? [...stroke.corners] : undefined
	};
}

function cloneSnapshot(snapshot: StrokeSnapshot): StrokeSnapshot {
	return snapshot.map((stroke) => cloneStroke(stroke));
}

function snapshotKey(snapshot: StrokeSnapshot): string {
	if (!snapshot.length) return '';
	const sorted = [...snapshot].sort((a, b) => a.id.localeCompare(b.id));
	const parts: string[] = [];
	for (const stroke of sorted) {
		const first = stroke.points[0];
		const last = stroke.points[stroke.points.length - 1];
		const t = stroke.transform;
		parts.push(
			[
				stroke.id,
				stroke.layer,
				stroke.points.length,
				stroke.size,
				stroke.color,
				first ? `${first.x.toFixed(2)},${first.y.toFixed(2)}` : 'none',
				last ? `${last.x.toFixed(2)},${last.y.toFixed(2)}` : 'none',
				t
					? `${t.a.toFixed(3)},${t.b.toFixed(3)},${t.c.toFixed(3)},${t.d.toFixed(3)},${t.e.toFixed(2)},${t.f.toFixed(2)}`
					: 'none'
			].join(':')
		);
	}
	return parts.join('|');
}

function ensureSeeded() {
	if (historyState.undo.length > 0) return;
	const empty: StrokeSnapshot = [];
	historyState.undo.push(empty);
	historyState.lastKey = snapshotKey(empty);
	historyState = { ...historyState };
}

export function clearHistory() {
	historyState.undo = [];
	historyState.redo = [];
	historyState.lastKey = '';
	ensureSeeded();
	historyState = { ...historyState };
}

export function pushStrokeHistory(strokes: Iterable<Stroke>) {
	ensureSeeded();
	const snapshot = Array.from(strokes, (stroke) => cloneStroke(stroke));
	const key = snapshotKey(snapshot);
	if (key === historyState.lastKey) return;

	historyState.undo.push(snapshot);
	historyState.lastKey = key;
	historyState.redo = [];

	if (historyState.undo.length > historyState.maxDepth) {
		historyState.undo.shift();
	}
	historyState = { ...historyState };
}

export function canUndo() {
	return historyState.undo.length > 1;
}

export function canRedo() {
	return historyState.redo.length > 0;
}

export function undoStrokeHistory(applySnapshot: (snapshot: StrokeSnapshot) => void) {
	if (!canUndo()) return;
	const current = historyState.undo.pop();
	if (current) historyState.redo.push(current);
	const previous = historyState.undo[historyState.undo.length - 1];
	if (!previous) {
		historyState = { ...historyState };
		return;
	}
	historyState.lastKey = snapshotKey(previous);
	applySnapshot(cloneSnapshot(previous));
	historyState = { ...historyState };
}

export function redoStrokeHistory(applySnapshot: (snapshot: StrokeSnapshot) => void) {
	if (!canRedo()) return;
	const next = historyState.redo.pop();
	if (!next) {
		historyState = { ...historyState };
		return;
	}
	historyState.undo.push(next);
	historyState.lastKey = snapshotKey(next);
	applySnapshot(cloneSnapshot(next));
	historyState = { ...historyState };
}
