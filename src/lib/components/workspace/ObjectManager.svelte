<script lang="ts">
	import { slide, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import {
		objectManagerState,
		getAllDisplayGroups,
		createGroupFromSelection,
		deleteGroup,
		renameGroup,
		toggleGroupVisibility,
		toggleGroupLock,
		toggleGroupExpanded,
		isGroupExpanded,
		startEditingGroupName,
		stopEditingGroupName,
		moveGroupUp,
		moveGroupDown,
		bringToFront,
		sendToBack,
		selectGroup,
		highlightGroup
	} from '$lib/stores/objectManager.svelte';
	import { canvasToolbarState } from '$lib/stores/canvasToolbar.svelte';
	import { strokes, groupState } from '$lib/stores/canvas.svelte';
	import {
		ChevronDown,
		Trash2,
		Eye,
		EyeOff,
		Lock,
		Unlock,
		ChevronUp,
		Layers,
		FolderPlus,
		MousePointerClick
	} from '@lucide/svelte';

	// Reactive display groups - recompute when dependencies change
	let displayGroups = $derived.by(() => {
		// Track all reactive dependencies
		void groupState.version;
		void strokes.size;
		void objectManagerState.version;
		void objectManagerState.manualGroups.length;
		return getAllDisplayGroups();
	});

	let hasSelection = $derived(canvasToolbarState.selectedIds.length > 0);
	let totalStrokes = $derived(strokes.size);

	function handleCreateGroup() {
		createGroupFromSelection();
	}

	function handleRenameKeydown(e: KeyboardEvent, groupId: string) {
		if (e.key === 'Enter') {
			const input = e.target as HTMLInputElement;
			renameGroup(groupId, input.value.trim() || 'Untitled');
			stopEditingGroupName();
		} else if (e.key === 'Escape') {
			stopEditingGroupName();
		}
	}

	function handleToggleExpand(groupId: string) {
		toggleGroupExpanded(groupId);
	}

	function getStrokeData(strokeId: string) {
		return strokes.get(strokeId);
	}
</script>

<div class="relative h-full w-full">
	<div class="absolute flex h-full w-full flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-white/10 bg-black/20 p-3">
			<h4 class="text-xs font-bold tracking-widest text-pink-400 uppercase">Objects</h4>
			<div class="flex items-center gap-1">
				<button
					onclick={handleCreateGroup}
					disabled={!hasSelection}
					class="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-pink-300 transition-colors hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-30"
					title="Create group from selection"
				>
					<FolderPlus class="h-3.5 w-3.5" />
					<span>Group</span>
				</button>
			</div>
		</div>

		<!-- Content -->
		<div class="relative flex min-h-0 shrink grow flex-col overflow-y-auto bg-black/40 p-2">
			<div class="flex flex-col gap-2">
				{#each displayGroups as group (group.id)}
					{@const expanded = isGroupExpanded(group.id)}
					<div
						role="group"
						aria-label="Object group"
						animate:flip={{ duration: 300 }}
						in:fly={{ y: 20, duration: 300 }}
						out:slide={{ duration: 200 }}
						onmouseenter={() => highlightGroup(group.id)}
						onmouseleave={() => highlightGroup(null)}
						class="overflow-hidden rounded-lg border bg-white/5 transition-colors hover:bg-white/10 {group.isManual
							? 'border-pink-500/30'
							: 'border-white/5'}"
					>
						<!-- Group header -->
						<div class="flex items-center">
							<button
								onclick={() => handleToggleExpand(group.id)}
								class="flex grow items-center gap-2 p-3 text-left"
							>
								<div class="flex grow items-center gap-3">
									<!-- Expand icon -->
									<ChevronDown
										class="h-4 w-4 text-white/50 transition-transform duration-200 {expanded
											? 'rotate-180'
											: ''}"
									/>

									<!-- Name -->
									{#if objectManagerState.editingGroupId === group.id}
										<!-- svelte-ignore a11y_autofocus -->
										<input
											type="text"
											value={group.name}
											autofocus
											onkeydown={(e) => handleRenameKeydown(e, group.id)}
											onblur={() => stopEditingGroupName()}
											onclick={(e) => e.stopPropagation()}
											class="w-24 border-b border-pink-400/50 bg-transparent text-sm text-white focus:outline-none"
										/>
									{:else}
										<span
											role="button"
											tabindex="0"
											class="text-sm font-medium text-white/90 {group.isManual
												? 'cursor-text'
												: 'cursor-default'}"
											ondblclick={() => group.isManual && startEditingGroupName(group.id)}
											onkeydown={(e) =>
												e.key === 'Enter' && group.isManual && startEditingGroupName(group.id)}
										>
											{group.name}
										</span>
									{/if}

									<!-- Stroke count -->
									<span class="text-[10px] text-white/40">
										{group.strokeIds.length} stroke{group.strokeIds.length !== 1 ? 's' : ''}
									</span>

									<!-- Manual badge -->
									{#if group.isManual}
										<span
											class="rounded bg-pink-500/20 px-1.5 py-0.5 text-[8px] font-bold text-pink-300 uppercase"
										>
											Manual
										</span>
									{/if}
								</div>
							</button>

							<!-- Quick actions -->
							<div class="flex items-center gap-0.5 pr-2">
								<!-- Select -->
								<button
									onclick={() => selectGroup(group.id)}
									class="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/70"
									title="Select group"
								>
									<MousePointerClick class="h-3.5 w-3.5" />
								</button>

								<!-- Visibility (manual only) -->
								{#if group.isManual}
									<button
										onclick={() => toggleGroupVisibility(group.id)}
										class="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/70"
										title={group.visible ? 'Hide' : 'Show'}
									>
										{#if group.visible}
											<Eye class="h-3.5 w-3.5" />
										{:else}
											<EyeOff class="h-3.5 w-3.5 text-pink-400" />
										{/if}
									</button>

									<!-- Lock -->
									<button
										onclick={() => toggleGroupLock(group.id)}
										class="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/70"
										title={group.locked ? 'Unlock' : 'Lock'}
									>
										{#if group.locked}
											<Lock class="h-3.5 w-3.5 text-pink-400" />
										{:else}
											<Unlock class="h-3.5 w-3.5" />
										{/if}
									</button>

									<!-- Delete -->
									<button
										onclick={() => deleteGroup(group.id)}
										class="rounded p-1 text-white/30 hover:bg-white/10 hover:text-red-400"
										title="Delete group"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						</div>

						<!-- Expanded content: strokes list + z-order -->
						{#if expanded}
							<div
								transition:slide|local={{ duration: 200 }}
								class="border-t border-white/5 bg-black/20 p-3"
							>
								<!-- Z-Order controls (manual groups only) -->
								{#if group.isManual}
									<div class="mb-3 flex items-center gap-2">
										<span class="text-[10px] text-white/40">Z-Order:</span>
										<div class="flex gap-1">
											<button
												onclick={() => bringToFront(group.id)}
												class="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
												title="Bring to front"
											>
												<Layers class="inline-block h-3 w-3" /> Front
											</button>
											<button
												onclick={() => moveGroupUp(group.id)}
												class="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
												title="Move up"
											>
												<ChevronUp class="inline-block h-3 w-3" />
											</button>
											<button
												onclick={() => moveGroupDown(group.id)}
												class="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
												title="Move down"
											>
												<ChevronDown class="inline-block h-3 w-3" />
											</button>
											<button
												onclick={() => sendToBack(group.id)}
												class="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
												title="Send to back"
											>
												<Layers class="inline-block h-3 w-3 rotate-180" /> Back
											</button>
										</div>
									</div>
								{/if}

								<!-- Strokes list -->
								<div class="flex flex-col gap-1">
									<span class="mb-1 text-[10px] font-medium text-white/50">Strokes</span>
									{#each group.strokeIds as strokeId (strokeId)}
										{@const stroke = getStrokeData(strokeId)}
										{#if stroke}
											<div
												class="flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-[10px] text-white/60"
											>
												<div
													class="h-2 w-2 rounded-full"
													style="background-color: {stroke.color}"
												></div>
												<span class="truncate">{strokeId.slice(0, 8)}...</span>
												<span class="text-white/30">{stroke.points.length} pts</span>
											</div>
										{/if}
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/each}

				{#if displayGroups.length === 0}
					<div class="flex flex-col items-center justify-center py-8 text-center text-white/30">
						<Layers class="mb-2 h-8 w-8" />
						<p class="text-xs">No objects yet</p>
						<p class="mt-1 text-[10px]">Draw something to see groups</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<div class="shrink-0 border-t border-white/10 bg-black/20 p-3">
			<div class="flex items-center justify-between text-[10px] text-white/40">
				<span>{displayGroups.length} group{displayGroups.length !== 1 ? 's' : ''}</span>
				<span>{totalStrokes} stroke{totalStrokes !== 1 ? 's' : ''} total</span>
			</div>
		</div>
	</div>
</div>
