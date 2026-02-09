<script lang="ts">
	import {
		getActiveLayer,
		setMode,
		setGroupSelect,
		setBrushSize,
		setBrushColor,
		canvasToolbarState
	} from '$lib/stores/canvasToolbar.svelte';
	import {
		Pencil,
		Redo2,
		SquareDashed,
		Undo2,
		Ungroup,
		Wand,
		Trash2,
		Sparkles
	} from '@lucide/svelte';
	import { triggerManualSelectionAnalysis } from '$lib/stores/analysis.svelte';
	import { BRUSH_SIZES } from '$lib/utils/constants';
	import { Layer } from '$lib/types';
	import ColorPalette from '../widgets/ColorPalette.svelte';
	import {
		deleteAllStrokes,
		deleteSelectedStrokes,
		redoStrokes,
		undoStrokes
	} from '$lib/stores/canvas.svelte';
	import { canUndo, canRedo } from '$lib/stores/history.svelte';
	import { onMount } from 'svelte';

	const isFinal = $derived(getActiveLayer() === Layer.FINAL);
	const canundo = $derived(canUndo());
	const canredo = $derived(canRedo());

	const isSelectMode = $derived(canvasToolbarState.mode === 'select');
	const groupSelect = $derived(canvasToolbarState.groupSelect);

	function isEditableTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
		return target.isContentEditable;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (isEditableTarget(event.target)) return;
		const key = event.key.toLowerCase();

		// Undo / Redo (Ctrl+Z, Ctrl+Y)
		if (event.ctrlKey || event.metaKey) {
			if (key === 'z') {
				event.preventDefault();
				if (event.shiftKey) {
					redoStrokes();
				} else {
					undoStrokes();
				}
				return;
			}
			if (key === 'y') {
				event.preventDefault();
				redoStrokes();
				return;
			}
		}

		// Single Key Shortcuts (only if no modifiers)
		if (!event.ctrlKey && !event.metaKey && !event.altKey) {
			if (key === 'v') {
				event.preventDefault();
				setMode(canvasToolbarState.mode === 'select' ? 'brush' : 'select', 'hotkey-toggle-mode');
				return;
			}
			if (key === 'g') {
				event.preventDefault();
				setGroupSelect(!canvasToolbarState.groupSelect, 'hotkey-toggle-group');
				return;
			}
			if (key === 'backspace' || key === 'delete') {
				event.preventDefault();
				deleteSelectedStrokes('hotkey-delete');
				return;
			}
			if (['1', '2', '3', '4'].includes(key)) {
				event.preventDefault();
				const index = parseInt(key) - 1;
				const size = BRUSH_SIZES[index];
				if (size !== undefined) {
					setMode('brush');
					setBrushSize(size, `hotkey-size-${size}`);
				}
				return;
			}
		}
	}

	function handleReset() {
		if (confirm('Are you sure you want to reset and clear all data? This cannot be undone.')) {
			localStorage.clear();
			window.location.reload();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	// Design System Configuration
	const COLORS = {
		slate: {
			active: 'border-slate-400/50 bg-slate-500/30 text-slate-50 shadow-lg shadow-slate-500/10',
			inactive:
				'border-white/10 bg-white/5 text-slate-300 hover:bg-slate-500/10 hover:text-slate-200'
		},
		violet: {
			active: 'border-violet-400/50 bg-violet-500/30 text-violet-50 shadow-lg shadow-violet-500/10',
			inactive:
				'border-white/10 bg-white/5 text-violet-200/70 hover:bg-violet-500/10 hover:text-violet-200'
		},
		rose: {
			active: 'border-rose-400/50 bg-rose-500/30 text-rose-50 shadow-lg shadow-rose-500/10',
			inactive:
				'border-white/10 bg-white/5 text-rose-200/70 hover:bg-rose-500/10 hover:text-rose-200'
		},
		red: {
			// For specific reset buttons
			active: 'border-red-500/50 bg-red-500/30 text-red-100',
			inactive:
				'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200'
		}
	} as const;
</script>

{#snippet ToolbarButton(
	id: string | undefined,
	disabled: boolean,
	title: string,
	onclick: (() => void) | undefined,
	active: boolean,
	color: keyof typeof COLORS,
	Icon: typeof Pencil
)}
	<button
		{disabled}
		data-demo-id={id}
		{title}
		{onclick}
		class="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-white/20 focus:outline-none
		{disabled
			? `cursor-not-allowed border-white/5 bg-white/3 opacity-50 ${color === 'slate' ? 'text-slate-400' : `text-${color}-400`}`
			: active
				? COLORS[color].active
				: COLORS[color].inactive}
		{!disabled && 'hover:-translate-y-0.5 active:translate-y-0 active:scale-95'}"
	>
		<Icon
			size={18}
			class="transition-transform duration-200 {active ? 'scale-110' : 'group-hover:scale-110'}"
		/>
	</button>
{/snippet}

{#snippet Separator()}
	<div class="mx-2 h-8 w-px shrink-0 bg-white/10"></div>
{/snippet}

<div
	class="flex h-full w-full flex-row items-center gap-2 overflow-x-auto px-4 py-2 lg:overflow-x-hidden {isFinal
		? 'pointer-events-none opacity-50'
		: ''}"
>
	<!-- Undo / Redo -->
	{@render ToolbarButton(
		'tool-undo',
		isFinal || !canundo,
		'Undo (Cmd/Ctrl+Z)',
		undoStrokes,
		false,
		'slate',
		Undo2
	)}
	{@render ToolbarButton(
		'tool-redo',
		isFinal || !canredo,
		'Redo (Cmd/Ctrl+Shift+Z)',
		redoStrokes,
		false,
		'slate',
		Redo2
	)}

	{@render Separator()}

	<!-- Mode Toggle -->
	{@render ToolbarButton(
		'tool-draw',
		isFinal,
		!isSelectMode ? 'Switch to Select mode (V)' : 'Switch to Draw mode (V)',
		() => setMode(isSelectMode ? 'brush' : 'select', 'tool-draw'),
		!isSelectMode,
		'violet',
		isSelectMode ? SquareDashed : Pencil
	)}

	<!-- Select mode Toggle -->
	{@render ToolbarButton(
		'tool-select',
		isFinal || !isSelectMode,
		(groupSelect ? 'Disable Group Select' : 'Enable Group Select') + ' (G)',
		() => setGroupSelect(!groupSelect, 'tool-select'),
		isSelectMode && groupSelect,
		'violet',
		groupSelect ? Wand : Ungroup
	)}

	<!-- Analyze stroke -->
	{@render ToolbarButton(
		'tool-analyze',
		isFinal || !isSelectMode || canvasToolbarState.selectedIds.length === 0,
		'Analyze selection',
		() => triggerManualSelectionAnalysis(new Set(canvasToolbarState.selectedIds)),
		false,
		'violet',
		Sparkles
	)}

	<!-- Delete stroke -->
	{@render ToolbarButton(
		'tool-delete',
		isFinal || !isSelectMode || canvasToolbarState.selectedIds.length === 0,
		'Delete stroke (Backspace/Delete)',
		() => deleteSelectedStrokes('hotkey-delete'),
		isSelectMode,
		'rose',
		Trash2
	)}

	{@render Separator()}

	<!-- Brush Sizes -->
	<div class="flex shrink-0 items-center gap-2">
		{#each BRUSH_SIZES as size (size)}
			<button
				disabled={isFinal}
				onclick={() => {
					setMode('brush');
					setBrushSize(size, `size-${size}`);
				}}
				class="group flex h-8 w-8 shrink-0 translate-y-0 items-center justify-center rounded-full border transition-all duration-200
				{isFinal
					? 'cursor-not-allowed border-white/5 bg-white/3 opacity-40 grayscale'
					: canvasToolbarState.brushSize === size
						? 'border-white/40 bg-white/20 ring-2 ring-white/20'
						: 'border-transparent bg-white/10 hover:bg-white/20'}
				{!isFinal && 'hover:-translate-y-0.5 active:translate-y-0 active:scale-95'}"
				aria-label="Brush size {size}px"
				title={`Brush size ${size}px (${BRUSH_SIZES.indexOf(size) + 1})`}
				data-demo-id="size-{size}"
			>
				<div
					class="rounded-full bg-white shadow-sm"
					style="width: {size}px; height: {size}px"
				></div>
			</button>
		{/each}
	</div>

	{@render Separator()}

	<ColorPalette
		dataPrefix="tool-color"
		color={canvasToolbarState.brushColor}
		onChange={(color) => {
			setBrushColor(color, `tool-color-${color}`);
		}}
	/>

	<div class="flex h-full shrink-0 -translate-x-6 flex-row items-center lg:translate-x-0">
		<div class="mr-4 h-6 w-px shrink-0 bg-white/10"></div>

		<!-- Action Buttons -->
		<div class="flex shrink-0 items-center gap-2">
			<!-- Clear Canvas (Custom Button Style to match ToolbarButton somewhat) -->
			<button
				disabled={isFinal}
				data-demo-id="tool-clear"
				onclick={() => deleteAllStrokes('tool-clear')}
				class="group flex h-10 shrink-0 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-all duration-200
				{isFinal
					? 'cursor-not-allowed border-white/5 bg-white/3 text-white/10 opacity-40 grayscale'
					: 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}
				{!isFinal && 'hover:-translate-y-0.5 active:translate-y-0 active:scale-95'}"
				title="Clear canvas (with undo)"
			>
				Clear
			</button>

			<button
				disabled={isFinal}
				data-demo-id="tool-reset"
				onclick={handleReset}
				class="group flex h-10 shrink-0 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-all duration-200
				{isFinal
					? 'cursor-not-allowed border-white/5 bg-white/3 text-white/10 opacity-40 grayscale'
					: COLORS['red'].inactive}
				{!isFinal && 'hover:-translate-y-0.5 active:translate-y-0 active:scale-95'}"
				title="Reset and clear all data"
			>
				Reset
			</button>
		</div>
	</div>
</div>
