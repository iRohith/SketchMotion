<script lang="ts">
	import {
		getActiveLayer,
		setMode,
		setGroupSelect,
		setBrushSize,
		setBrushColor,
		canvasToolbarState
	} from '$lib/stores/canvasToolbar.svelte';
	import { Pencil, Redo2, SquareDashed, Undo2, Ungroup, Wand, Trash2 } from '@lucide/svelte';
	import { BRUSH_SIZES } from '$lib/utils/constants';
	import { Layer } from '$lib/types';
	import ColorPalette from '../widgets/ColorPalette.svelte';
	import { deleteAllStrokes, deleteSelectedStrokes } from '$lib/stores/canvas.svelte';

	const isFinal = $derived(getActiveLayer() === Layer.FINAL);
	const canUndo = $derived(false);
	const canRedo = $derived(true);

	const isSelectMode = $derived(canvasToolbarState.mode === 'select');
	const groupSelect = $derived(canvasToolbarState.groupSelect);

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
		isFinal || !canUndo,
		'Undo (Cmd/Ctrl+Z)',
		undefined,
		false,
		'slate',
		Undo2
	)}
	{@render ToolbarButton(
		'tool-redo',
		isFinal || !canRedo,
		'Redo (Cmd/Ctrl+Shift+Z)',
		undefined,
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
		groupSelect ? 'Disable Group Select' : 'Enable Group Select',
		() => setGroupSelect(!groupSelect, 'tool-select'),
		isSelectMode && groupSelect,
		'violet',
		groupSelect ? Wand : Ungroup
	)}

	<!-- Delete stroke -->
	{@render ToolbarButton(
		'tool-delete',
		isFinal || !isSelectMode || canvasToolbarState.selectedIds.length === 0,
		'Delete stroke (Backspace)',
		() => deleteSelectedStrokes('tool-delete'),
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
				title={`Brush size ${size}px`}
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
				onclick={() => deleteAllStrokes('tool-reset')}
				class="group flex h-10 shrink-0 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-all duration-200
				{isFinal
					? 'cursor-not-allowed border-white/5 bg-white/3 text-white/10 opacity-40 grayscale'
					: COLORS['red'].inactive}
				{!isFinal && 'hover:-translate-y-0.5 active:translate-y-0 active:scale-95'}"
				title="Reset canvas (clear history)"
			>
				Reset
			</button>
		</div>
	</div>
</div>
