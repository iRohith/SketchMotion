import { strokes, groups, requestRender } from './canvas.svelte';
import { canvasToolbarState } from './canvasToolbar.svelte';

// --- Types ---

export type ManualGroup = {
	id: string;
	name: string;
	strokeIds: string[];
	locked: boolean;
	visible: boolean;
};

export type DisplayGroup = {
	id: string;
	name: string;
	strokeIds: string[];
	locked: boolean;
	visible: boolean;
	isManual: boolean;
};

// --- State (all reactive) ---

export const objectManagerState = $state({
	// Manual groups in z-order (first = bottom, last = top)
	manualGroups: [] as ManualGroup[],
	// IDs of expanded groups in the UI
	expandedGroupIds: [] as string[],
	// Currently editing name
	editingGroupId: null as string | null,
	// Version counter for reactivity
	version: 0
});

// --- Group Management ---

/**
 * Create a new manual group from selected strokes
 */
export function createGroupFromSelection(name?: string): string | null {
	const selectedIds = canvasToolbarState.selectedIds;
	if (selectedIds.length === 0) return null;

	const groupId = crypto.randomUUID();
	const groupName = name || `Group ${objectManagerState.manualGroups.length + 1}`;

	objectManagerState.manualGroups = [
		...objectManagerState.manualGroups,
		{
			id: groupId,
			name: groupName,
			strokeIds: [...selectedIds],
			locked: false,
			visible: true
		}
	];

	// Clear selection
	canvasToolbarState.selectedIds = [];
	objectManagerState.version++;
	requestRender();

	console.log(`[ObjectManager] Created group: ${groupName}`);
	return groupId;
}

/**
 * Delete a manual group (strokes remain)
 */
export function deleteGroup(groupId: string): void {
	objectManagerState.manualGroups = objectManagerState.manualGroups.filter((g) => g.id !== groupId);
	objectManagerState.expandedGroupIds = objectManagerState.expandedGroupIds.filter(
		(id) => id !== groupId
	);
	objectManagerState.version++;
	requestRender();
}

/**
 * Rename a group
 */
export function renameGroup(groupId: string, newName: string): void {
	const group = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (group) {
		group.name = newName;
		objectManagerState.version++;
	}
}

/**
 * Add strokes to an existing group
 */
export function addStrokesToGroup(groupId: string, strokeIds: string[]): void {
	const group = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (!group) return;

	const existing = new Set(group.strokeIds);
	for (const id of strokeIds) {
		existing.add(id);
	}
	group.strokeIds = Array.from(existing);
	objectManagerState.version++;
	requestRender();
}

/**
 * Remove strokes from a group
 */
export function removeStrokesFromGroup(groupId: string, strokeIds: string[]): void {
	const group = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (!group) return;

	const toRemove = new Set(strokeIds);
	group.strokeIds = group.strokeIds.filter((id) => !toRemove.has(id));

	// Delete group if empty
	if (group.strokeIds.length === 0) {
		deleteGroup(groupId);
	} else {
		objectManagerState.version++;
		requestRender();
	}
}

// --- Visibility & Lock ---

export function toggleGroupVisibility(groupId: string): void {
	const group = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (group) {
		group.visible = !group.visible;
		objectManagerState.version++;
		requestRender();
	}
}

export function toggleGroupLock(groupId: string): void {
	const group = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (group) {
		group.locked = !group.locked;
		objectManagerState.version++;
	}
}

// --- Z-Order Management ---

export function moveGroupUp(groupId: string): void {
	const index = objectManagerState.manualGroups.findIndex((g) => g.id === groupId);
	if (index < objectManagerState.manualGroups.length - 1 && index >= 0) {
		const groups = [...objectManagerState.manualGroups];
		[groups[index], groups[index + 1]] = [groups[index + 1], groups[index]];
		objectManagerState.manualGroups = groups;
		objectManagerState.version++;
		requestRender();
	}
}

export function moveGroupDown(groupId: string): void {
	const index = objectManagerState.manualGroups.findIndex((g) => g.id === groupId);
	if (index > 0) {
		const groups = [...objectManagerState.manualGroups];
		[groups[index], groups[index - 1]] = [groups[index - 1], groups[index]];
		objectManagerState.manualGroups = groups;
		objectManagerState.version++;
		requestRender();
	}
}

export function bringToFront(groupId: string): void {
	const group = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (group) {
		objectManagerState.manualGroups = [
			...objectManagerState.manualGroups.filter((g) => g.id !== groupId),
			group
		];
		objectManagerState.version++;
		requestRender();
	}
}

export function sendToBack(groupId: string): void {
	const group = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (group) {
		objectManagerState.manualGroups = [
			group,
			...objectManagerState.manualGroups.filter((g) => g.id !== groupId)
		];
		objectManagerState.version++;
		requestRender();
	}
}

// --- UI State ---

export function toggleGroupExpanded(groupId: string): void {
	if (objectManagerState.expandedGroupIds.includes(groupId)) {
		objectManagerState.expandedGroupIds = objectManagerState.expandedGroupIds.filter(
			(id) => id !== groupId
		);
	} else {
		objectManagerState.expandedGroupIds = [...objectManagerState.expandedGroupIds, groupId];
	}
}

export function isGroupExpanded(groupId: string): boolean {
	return objectManagerState.expandedGroupIds.includes(groupId);
}

export function startEditingGroupName(groupId: string): void {
	objectManagerState.editingGroupId = groupId;
}

export function stopEditingGroupName(): void {
	objectManagerState.editingGroupId = null;
}

// --- Helpers ---

/**
 * Get all groups (manual + auto-detected) for display
 */
export function getAllDisplayGroups(): DisplayGroup[] {
	const result: DisplayGroup[] = [];

	// Track which strokes are in manual groups
	const manualStrokeIds = new Set<string>();
	for (const group of objectManagerState.manualGroups) {
		for (const id of group.strokeIds) {
			// Only include if stroke still exists
			if (strokes.has(id)) {
				manualStrokeIds.add(id);
			}
		}
		// Filter to only existing strokes
		const validStrokes = group.strokeIds.filter((id) => strokes.has(id));
		if (validStrokes.length > 0) {
			result.push({
				id: group.id,
				name: group.name,
				strokeIds: validStrokes,
				locked: group.locked,
				visible: group.visible,
				isManual: true
			});
		}
	}

	// Add auto-detected groups for strokes not in manual groups
	let autoIndex = 1;
	for (const [groupId, strokeIdSet] of groups.entries()) {
		// Filter out strokes that are in manual groups
		const remainingStrokes: string[] = [];
		for (const id of strokeIdSet) {
			if (!manualStrokeIds.has(id) && strokes.has(id)) {
				remainingStrokes.push(id);
			}
		}

		if (remainingStrokes.length > 0) {
			result.push({
				id: `auto-${groupId}`,
				name: `Auto ${autoIndex++}`,
				strokeIds: remainingStrokes,
				locked: false,
				visible: true,
				isManual: false
			});
		}
	}

	return result;
}

/**
 * Select all strokes in a group
 */
export function selectGroup(groupId: string): void {
	// Check manual groups first
	const manual = objectManagerState.manualGroups.find((g) => g.id === groupId);
	if (manual && !manual.locked) {
		canvasToolbarState.selectedIds = [...manual.strokeIds];
		requestRender();
		return;
	}

	// Check auto groups
	const allGroups = getAllDisplayGroups();
	const autoGroup = allGroups.find((g) => g.id === groupId);
	if (autoGroup) {
		canvasToolbarState.selectedIds = [...autoGroup.strokeIds];
		requestRender();
	}
}

/**
 * Highlight strokes on hover
 */
export function highlightGroup(groupId: string | null): void {
	if (groupId) {
		const allGroups = getAllDisplayGroups();
		const group = allGroups.find((g) => g.id === groupId);
		if (group) {
			canvasToolbarState.highlightedStrokeIds = new Set(group.strokeIds);
		} else {
			canvasToolbarState.highlightedStrokeIds = new Set();
		}
	} else {
		canvasToolbarState.highlightedStrokeIds = new Set();
	}
	requestRender();
}

/**
 * Reset object manager state
 */
export function resetObjectManagerState(): void {
	objectManagerState.manualGroups = [];
	objectManagerState.expandedGroupIds = [];
	objectManagerState.editingGroupId = null;
	objectManagerState.version = 0;
}
