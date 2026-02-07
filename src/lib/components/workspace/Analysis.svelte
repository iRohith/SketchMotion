<script lang="ts">
	import { slide, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		analysisResults,
		deleteAnalysisItem,
		toggleAnalysisItem,
		markAnalysisItemInteracted,
		addUserNote,
		setAnalysisItemFeedback,
		requestItemRetry,
		navigateHistoryPrev,
		navigateHistoryNext,
		getDisplayedItem,
		handleRecreate,
		handleRetrace
	} from '$lib/stores/analysis.svelte';
	import { CANVAS_WIDTH, CANVAS_HEIGHT } from '$lib/utils/constants';
	import {
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Trash2,
		SendHorizontal,
		CircleCheck,
		CircleX,
		Pencil,
		Check,
		RefreshCcw,
		Loader2
	} from '@lucide/svelte';

	let scrollContainer = $state<HTMLDivElement>();
	let isAtBottom = $state(true);
	let isEditing = $state(false);
	let chatInput = $state<HTMLInputElement>();

	let editingOtherField = new SvelteSet<string>();
	let otherFieldValues = $state<Record<string, string>>({});
	let focusFieldId = $state<string | null>(null);
	let hoveredImage = $state<{
		src: string;
		x: number;
		y: number;
		bounds?: { minX: number; minY: number; maxX: number; maxY: number };
	} | null>(null);

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 20;
	}

	$effect(() => {
		void analysisResults.items;
		if (isAtBottom && scrollContainer && !analysisResults.highlightedItemId && !isEditing) {
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}
	});

	$effect(() => {
		if (analysisResults.highlightedItemId && scrollContainer) {
			const item = analysisResults.items.find((i) => i.id === analysisResults.highlightedItemId);
			const shouldScroll = !isEditing || item?.userModified;

			if (shouldScroll) {
				const element = document.getElementById(`item-${analysisResults.highlightedItemId}`);
				if (element) {
					element.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
			}
		}
	});

	function handleFeedback(id: string, type: 'yes' | 'no' | 'other', value?: string) {
		setAnalysisItemFeedback(id, type, value, `send-feedback-${type}-${id}`);

		if (type === 'other' && value) {
			editingOtherField.delete(id);
			delete otherFieldValues[id];
		}
	}

	function enableOtherEdit(id: string) {
		const item = analysisResults.items.find((i) => i.id === id);
		if (item && item.feedbackText) {
			otherFieldValues = { ...otherFieldValues, [id]: item.feedbackText };
		}
		editingOtherField.add(id);
		focusFieldId = id;
	}

	function submitOtherFeedback(id: string) {
		const value = otherFieldValues[id];
		if (value && value.trim()) {
			handleFeedback(id, 'other', value.trim());
		}
	}

	function autoFocus(node: HTMLInputElement, itemId: string) {
		if (focusFieldId === itemId) {
			setTimeout(() => {
				node.focus();
				focusFieldId = null;
			}, 0);
		}

		return {
			update(newItemId: string) {
				if (focusFieldId === newItemId) {
					node.focus();
					focusFieldId = null;
				}
			}
		};
	}

	function handleSendNote() {
		if (chatInput && chatInput.value.trim()) {
			addUserNote(chatInput.value.trim(), 'send-analysis-chat');
			chatInput.value = '';
		}
	}
</script>

<div class="relative h-full w-full">
	<div class="absolute flex h-full w-full flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-white/10 bg-black/20 p-3">
			<h4 class="text-xs font-bold tracking-widest text-yellow-400 uppercase">Analysis</h4>
		</div>

		<!-- Content -->
		<div
			bind:this={scrollContainer}
			onscroll={handleScroll}
			class="relative flex min-h-0 shrink grow flex-col overflow-y-auto bg-black/40 p-2"
		>
			<div class="flex flex-col gap-2">
				{#each analysisResults.items as item (item.id)}
					<div
						id="item-{item.id}"
						role="group"
						aria-label="Analysis item"
						animate:flip={{ duration: 300 }}
						in:fly={{ y: 20, duration: 300 }}
						out:slide={{ duration: 200 }}
						onmouseenter={() => (analysisResults.hoveredItemId = item.id)}
						onmouseleave={() => (analysisResults.hoveredItemId = null)}
						class="overflow-hidden rounded-lg border bg-white/5 transition-colors hover:bg-white/10 {analysisResults.highlightedItemId ===
						item.id
							? 'animate-border-pulse border-pink-500/50'
							: 'border-white/5'}"
					>
						<!-- Item header (title + delete) -->
						<div class="flex items-center">
							<button
								onclick={() => toggleAnalysisItem(item.id)}
								class="flex grow items-center justify-between gap-2 p-3 text-left"
							>
								<div class="flex items-center gap-4">
									{#if item.imageUrl}
										{@const padding = 20}
										{@const minX = item.bounds ? Math.max(0, item.bounds.minX - padding) : 0}
										{@const minY = item.bounds ? Math.max(0, item.bounds.minY - padding) : 0}
										{@const maxX = item.bounds
											? Math.min(CANVAS_WIDTH, item.bounds.maxX + padding)
											: CANVAS_WIDTH}
										{@const maxY = item.bounds
											? Math.min(CANVAS_HEIGHT, item.bounds.maxY + padding)
											: CANVAS_HEIGHT}
										{@const w = maxX - minX}
										{@const h = maxY - minY}
										{@const dim = Math.max(w, h, 1)}
										<!-- Two preview images side by side -->
										<div class="flex shrink-0 gap-0.5">
											<!-- Intent Image (bright/dim) -->
											<div
												class="relative block h-8 w-8 overflow-hidden rounded-l bg-black/50"
												role="img"
												aria-label="Intent Preview"
												title="Intent (bright = target)"
												style="
													background-image: url({item.imageUrl});
													background-size: {(CANVAS_WIDTH / dim) * 32}px auto;
													background-position: -{(minX / dim) * 32}px -{(minY / dim) * 32}px;
													background-repeat: no-repeat;
												"
												onmouseenter={(e) => {
													const rect = (e.target as Element).getBoundingClientRect();
													hoveredImage = {
														src: item.imageUrl!,
														x: rect.right + 10,
														y: rect.top,
														bounds: item.bounds
													};
												}}
												onmouseleave={() => (hoveredImage = null)}
											></div>
											<!-- Context Image (colored outlines) -->
											{#if item.contextImageUrl}
												<div
													class="relative block h-8 w-8 overflow-hidden rounded-r bg-black/50"
													role="img"
													aria-label="Context Preview"
													title="Context (colored outlines)"
													style="
														background-image: url({item.contextImageUrl});
														background-size: {(CANVAS_WIDTH / dim) * 32}px auto;
														background-position: -{(minX / dim) * 32}px -{(minY / dim) * 32}px;
														background-repeat: no-repeat;
													"
													onmouseenter={(e) => {
														const rect = (e.target as Element).getBoundingClientRect();
														hoveredImage = {
															src: item.contextImageUrl!,
															x: rect.right + 10,
															y: rect.top,
															bounds: item.bounds
														};
													}}
													onmouseleave={() => (hoveredImage = null)}
												></div>
											{/if}
										</div>
									{/if}
									<span class="text-sm font-medium text-white/90">{item.title}</span>
									{#if item.status === 'loading'}
										<Loader2 class="h-4 w-4 animate-spin text-yellow-400" />
									{:else if item.status === 'error'}
										<span
											role="button"
											tabindex="0"
											onclick={(e) => {
												e.stopPropagation();
												requestItemRetry(item.id);
											}}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.stopPropagation();
													requestItemRetry(item.id);
												}
											}}
											class="flex cursor-pointer items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/30"
											aria-label="Retry analysis"
										>
											<RefreshCcw class="h-3 w-3" />
											<span>Retry</span>
										</span>
									{:else if item.feedback === 'yes'}
										<CircleCheck class="h-4 w-4 text-green-400" />
									{:else if item.feedback === 'no'}
										<CircleX class="h-4 w-4 text-red-400" />
									{/if}
								</div>
								<ChevronDown
									class="h-4 w-4 text-white/50 transition-transform duration-200 {item.expanded
										? 'rotate-180'
										: ''}"
								/>
							</button>
							<button
								onclick={() => deleteAnalysisItem(item.id)}
								class="mr-2 rounded p-1 text-white/30 hover:bg-white/10 hover:text-red-400"
								aria-label="Delete item"
							>
								<Trash2 class="h-4 w-4" stroke="currentColor" />
							</button>
						</div>

						<!-- Item content (when expanded) -->
						{#if item.expanded}
							{@const displayed = getDisplayedItem(item.id)}
							<div
								transition:slide|local={{ duration: 200 }}
								class="border-t border-white/5 bg-black/20 p-3"
							>
								<!-- History navigation bar -->
								{#if item.history.length > 0 && displayed}
									<div class="mb-2 flex items-center justify-between rounded bg-white/5 px-2 py-1">
										<button
											onclick={() => navigateHistoryPrev(item.id)}
											disabled={displayed.currentIndex === 0}
											class="rounded p-0.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
											aria-label="Previous version"
										>
											<ChevronLeft class="h-4 w-4" />
										</button>
										<span class="text-[10px] text-white/50">
											{#if displayed.isHistorical}
												<span class="text-yellow-400">v{displayed.currentIndex + 1}</span>
											{:else}
												<span class="text-green-400">current</span>
											{/if}
											<span class="mx-1">/</span>
											<span>{displayed.totalVersions}</span>
										</span>
										<button
											onclick={() => navigateHistoryNext(item.id)}
											disabled={!displayed.isHistorical}
											class="rounded p-0.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
											aria-label="Next version"
										>
											<ChevronRight class="h-4 w-4" />
										</button>
									</div>
								{/if}

								<p class="mb-3 text-xs leading-relaxed text-white/70">
									{displayed?.content ?? item.content}
								</p>

								{#if displayed?.generatedImageUrl || item.generatedImageUrl}
									<div class="mb-3 flex flex-col gap-2">
										<span class="text-[10px] font-medium tracking-wider text-white/40 uppercase"
											>AI Generation</span
										>
										<div class="grid grid-cols-2 gap-2">
											<div
												class="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/50"
											>
												<img
													src={displayed?.generatedImageUrl ?? item.generatedImageUrl}
													alt="AI Generated"
													class="absolute inset-0 h-full w-full object-contain p-1"
												/>
												<div
													class="absolute right-0 bottom-0 left-0 bg-black/60 px-1 py-0.5 text-center text-[8px] text-white/80"
												>
													Raw Output
												</div>
											</div>
											{#if displayed?.generatedSvg || item.generatedSvg}
												<div
													class="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/5 p-1"
												>
													<div class="h-full w-full opacity-80">
														<!-- eslint-disable-next-line svelte/no-at-html-tags -->
														{@html displayed?.generatedSvg ?? item.generatedSvg}
													</div>
													<div
														class="absolute right-0 bottom-0 left-0 bg-black/60 px-1 py-0.5 text-center text-[8px] text-white/80"
													>
														Vector Trace
													</div>
													<div class="absolute top-1 right-1">
														<button
															onclick={() => handleRetrace(item.id)}
															class="rounded bg-black/50 p-1 text-white/70 hover:bg-black/70 hover:text-white"
															title="Retrace Image"
															aria-label="Retrace Image"
														>
															<RefreshCcw class="h-3 w-3" />
														</button>
													</div>
												</div>
											{/if}
										</div>
									</div>
								{/if}

								<!-- Feedback section -->
								<div class="flex items-center gap-2">
									<div class="flex items-center gap-1">
										<button
											onclick={() => handleFeedback(item.id, 'yes')}
											data-demo-id="send-feedback-yes-{item.id}"
											disabled={analysisResults.isProcessing}
											class="rounded bg-green-500/20 px-2 py-1 text-[10px] font-medium text-green-300 transition-colors hover:bg-green-500/30 hover:text-green-200 disabled:cursor-not-allowed disabled:opacity-50"
										>
											Yes
										</button>
										<button
											onclick={() => handleFeedback(item.id, 'no')}
											data-demo-id="send-feedback-no-{item.id}"
											disabled={analysisResults.isProcessing}
											class="rounded bg-red-500/20 px-2 py-1 text-[10px] font-medium text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
										>
											No
										</button>
										<div class="mx-2 flex items-center gap-1">
											<span class="text-[10px] font-medium text-white/40">Other:</span>
											{#if item.feedback === 'other' && !editingOtherField.has(item.id)}
												<!-- Locked state - show saved value as text -->
												<span class="text-[10px] text-white/70">
													{item.feedbackText || ''}
												</span>
												<button
													onclick={(e) => {
														e.stopPropagation();
														enableOtherEdit(item.id);
													}}
													class="rounded p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
													aria-label="Edit feedback"
												>
													<Pencil class="h-3 w-3" />
												</button>
											{:else}
												<!-- Editable state - allow input -->
												<input
													type="text"
													placeholder="Other..."
													bind:value={otherFieldValues[item.id]}
													use:autoFocus={item.id}
													disabled={analysisResults.isProcessing}
													class="w-24 border-b border-white/20 bg-transparent text-[10px] text-white transition-colors placeholder:text-white/30 focus:border-white/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
													onkeydown={(e: KeyboardEvent) => {
														if (
															e.key === 'Enter' &&
															!analysisResults.isProcessing &&
															(e.target as HTMLInputElement).value.trim()
														) {
															handleFeedback(
																item.id,
																'other',
																(e.target as HTMLInputElement).value.trim()
															);
														}
													}}
													onclick={(e: MouseEvent) => e.stopPropagation()}
													onfocus={() => {
														isEditing = true;
														markAnalysisItemInteracted(item.id);
													}}
													onblur={() => (isEditing = false)}
												/>
												<button
													onclick={(e) => {
														e.stopPropagation();
														submitOtherFeedback(item.id);
													}}
													data-demo-id="send-feedback-other-{item.id}"
													disabled={analysisResults.isProcessing ||
														!otherFieldValues[item.id]?.trim()}
													class="rounded p-0.5 text-green-400/60 transition-colors hover:bg-green-500/10 hover:text-green-400 disabled:cursor-not-allowed disabled:opacity-30"
													aria-label="Submit feedback"
												>
													<Check class="h-3 w-3" />
												</button>
											{/if}
										</div>
										{#if item.imageUrl}
											<button
												onclick={() => handleRecreate(item.id)}
												disabled={analysisResults.isProcessing}
												class="ml-auto rounded bg-blue-500/20 px-2 py-1 text-[10px] font-medium text-blue-300 transition-colors hover:bg-blue-500/30 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
												title="Recreate stroke with AI"
											>
												Recreate
											</button>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if analysisResults.isProcessing && !analysisResults.items.length}
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div
						class="h-6 w-6 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent"
					></div>
				</div>
			{/if}
		</div>

		<!-- Chat Input -->
		<div class="shrink-0 border-t border-white/10 bg-black/20 p-3">
			<div class="relative flex items-center gap-2">
				<input
					bind:this={chatInput}
					type="text"
					disabled={analysisResults.isProcessing}
					placeholder={analysisResults.isProcessing ? 'Analyzing...' : 'Add a note or query...'}
					class="w-full rounded-full border border-white/10 bg-black/40 px-4 py-2 pr-10 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:bg-white/5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					onkeydown={(e) => {
						if (e.key === 'Enter' && !analysisResults.isProcessing) {
							handleSendNote();
						}
					}}
					onfocus={() => (isEditing = true)}
					onblur={() => (isEditing = false)}
				/>
				<button
					onclick={handleSendNote}
					disabled={analysisResults.isProcessing}
					class="absolute right-2 rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
					aria-label="Send note"
					data-demo-id="send-analysis-chat"
				>
					<SendHorizontal class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>

	{#if hoveredImage}
		{#if hoveredImage.bounds}
			{@const padding = 20}
			{@const minX = Math.max(0, hoveredImage.bounds.minX - padding)}
			{@const minY = Math.max(0, hoveredImage.bounds.minY - padding)}
			{@const maxX = Math.min(CANVAS_WIDTH, hoveredImage.bounds.maxX + padding)}
			{@const maxY = Math.min(CANVAS_HEIGHT, hoveredImage.bounds.maxY + padding)}
			{@const w = maxX - minX}
			{@const h = maxY - minY}
			{@const dim = Math.max(w, h, 1)}
			<div
				class="pointer-events-none fixed z-100 overflow-hidden rounded-lg border border-white/20 bg-black/90 shadow-xl"
				style="left: {hoveredImage.x}px; top: {hoveredImage.y}px; width: 256px; height: 256px;"
				transition:fly={{ x: -10, duration: 200 }}
			>
				<div
					class="h-full w-full"
					style="
					background-image: url({hoveredImage.src});
					background-size: {(CANVAS_WIDTH / dim) * 256}px auto;
					background-position: -{(minX / dim) * 256}px -{(minY / dim) * 256}px;
					background-repeat: no-repeat;
				"
				></div>
			</div>
		{:else}
			<div
				class="pointer-events-none fixed z-100 overflow-hidden rounded-lg border border-white/20 bg-black/90 shadow-xl"
				style="left: {hoveredImage.x}px; top: {hoveredImage.y}px;"
				transition:fly={{ x: -10, duration: 200 }}
			>
				<img src={hoveredImage.src} alt="Large Preview" class="h-64 w-64 object-contain" />
			</div>
		{/if}
	{/if}
</div>

<style>
	@keyframes border-pulse {
		0% {
			border-color: rgba(255, 255, 255, 0.05);
			box-shadow: 0 0 0 0 rgba(236, 72, 153, 0);
		}
		50% {
			border-color: rgba(236, 72, 153, 0.8);
			box-shadow: 0 0 15px rgba(236, 72, 153, 0.3);
		}
		100% {
			border-color: rgba(255, 255, 255, 0.05);
			box-shadow: 0 0 0 0 rgba(236, 72, 153, 0);
		}
	}
	.animate-border-pulse {
		animation: border-pulse 1.5s ease-out 1;
	}
</style>
