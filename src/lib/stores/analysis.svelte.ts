import { moveCursorToElement, type CursorOptions } from './demoCursor.svelte';

export const analysisResults = $state({
	items: [] as Array<{
		id: string;
		title: string;
		content: string;
		expanded: boolean;
		userModified?: boolean;
		userInteracted?: boolean;
		feedback?: 'yes' | 'no' | 'other' | null;
		feedbackText?: string;
		objectId?: string;
		timestamp: number;
		imageUrl?: string;
		bounds?: { minX: number; minY: number; maxX: number; maxY: number };
	}>,
	isProcessing: false,
	highlightedItemId: null as string | null,
	hoveredItemId: null as string | null,
	maxItems: 100
});

const timeoutIds = new Set<ReturnType<typeof setTimeout>>();

export function addUserNote(content: string, elementId?: string, options?: CursorOptions) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			addAnalysisItem('User Note', content, true);
		},
		...options
	});
}

export function addAnalysisItem(
	title: string,
	content: string,
	userModified = false,
	id: string = `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
	objectId?: string,
	imageUrl?: string,
	bounds?: { minX: number; minY: number; maxX: number; maxY: number }
) {
	analysisResults.items.push({
		id,
		title,
		content,
		expanded: true,
		userModified,
		userInteracted: false,
		feedback: null,
		feedbackText: '',
		objectId,
		timestamp: Date.now(),
		imageUrl,
		bounds
	});

	const collapseTimeout = setTimeout(() => {
		timeoutIds.delete(collapseTimeout);

		if (analysisResults.items.length > 1) {
			const lastItem = analysisResults.items[analysisResults.items.length - 2];
			if (lastItem && !lastItem.userInteracted) {
				lastItem.expanded = false;
			}
		}
	}, 300);
	timeoutIds.add(collapseTimeout);

	analysisResults.highlightedItemId = id;
	const highlightTimeout = setTimeout(() => {
		timeoutIds.delete(highlightTimeout);
		analysisResults.highlightedItemId = null;
	}, 1500);
	timeoutIds.add(highlightTimeout);

	if (analysisResults.items.length > analysisResults.maxItems) {
		analysisResults.items = analysisResults.items.slice(-analysisResults.maxItems);
	}

	return id;
}

export function deleteAnalysisItem(id: string) {
	analysisResults.items = analysisResults.items.filter((item) => item.id !== id);
}

export function toggleAnalysisItem(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.expanded = !item.expanded;
		item.userInteracted = true;
	}
}

export function markAnalysisItemInteracted(id: string) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.userInteracted = true;
	}
}

export function clearAnalysisResults() {
	analysisResults.items = [];
	analysisResults.isProcessing = false;
	analysisResults.highlightedItemId = null;
	analysisResults.hoveredItemId = null;
}

export function getHoveredObjectId(): string | null {
	if (!analysisResults.hoveredItemId) return null;
	const item = analysisResults.items.find((i) => i.id === analysisResults.hoveredItemId);
	return item?.objectId || null;
}

export function updateAnalysisItem(
	id: string,
	title: string,
	content: string,
	objectId?: string,
	imageUrl?: string,
	bounds?: { minX: number; minY: number; maxX: number; maxY: number }
) {
	const item = analysisResults.items.find((i) => i.id === id);
	if (item) {
		item.title = title;
		item.content = content;
		item.userModified = true;
		item.expanded = true;
		if (objectId) item.objectId = objectId;
		item.timestamp = Date.now();
		if (objectId) item.objectId = objectId;
		if (imageUrl) item.imageUrl = imageUrl;
		if (bounds) item.bounds = bounds;

		analysisResults.highlightedItemId = id;
		const highlightTimeout = setTimeout(() => {
			timeoutIds.delete(highlightTimeout);
			analysisResults.highlightedItemId = null;
		}, 1500);
		timeoutIds.add(highlightTimeout);
	}
}

export function cleanupAnalysisTimers() {
	timeoutIds.forEach((id) => clearTimeout(id));
	timeoutIds.clear();
}

export function setAnalysisItemFeedback(
	id: string,
	feedback: 'yes' | 'no' | 'other',
	feedbackText?: string,
	elementId?: string,
	options?: CursorOptions
) {
	moveCursorToElement(elementId, {
		onComplete: () => {
			const item = analysisResults.items.find((i) => i.id === id);
			if (item) {
				item.feedback = feedback;
				item.feedbackText = feedbackText;
				item.userInteracted = true;
			}
		},
		...options
	});
}
