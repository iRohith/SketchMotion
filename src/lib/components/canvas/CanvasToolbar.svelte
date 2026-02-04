<script lang="ts">
	import {
		getActiveLayer,
		getMode,
		getGroupSelect,
		getEraserMode,
		getBrushSize,
		getBrushColor,
		setMode,
		setGroupSelect,
		setEraserMode,
		setBrushSize,
		setBrushColor
	} from '$lib/stores/canvas.svelte';
	import { Eraser, Pencil, Redo2, SquareDashed, Undo2, Ungroup, Wand } from '@lucide/svelte';
	import { BRUSH_SIZES } from '$lib/utils/constants';
	import { Layer } from '$lib/types';
	import ColorPalette from '../widgets/ColorPalette.svelte';

	const isFinal = $derived(getActiveLayer() === Layer.FINAL);
	const canUndo = $derived(false);
	const canRedo = $derived(false);

	const mode = $derived(getMode());
	const isSelectMode = $derived(mode === 'select');
	const groupSelect = $derived(getGroupSelect());
	const isEraser = $derived(getEraserMode());
	const brushSize = $derived(getBrushSize());
	const brushColor = $derived(getBrushColor());
</script>

<div
	class="flex h-full w-full flex-row items-center gap-2 overflow-x-auto px-4 py-2 lg:overflow-x-hidden {isFinal
		? 'pointer-events-none opacity-50'
		: ''}"
>
	<button
		disabled={isFinal || !canUndo}
		data-demo-id="tool-undo"
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none {canUndo
			? 'border-slate-400/40 bg-slate-500/20 text-slate-50 hover:-translate-y-px hover:border-slate-300 hover:bg-slate-500/30 active:translate-y-0 active:bg-slate-500/40'
			: 'cursor-not-allowed border-white/10 bg-white/3 text-white/20 hover:translate-y-0 hover:bg-white/3'}"
		title="Undo (Cmd/Ctrl+Z)"
	>
		<Undo2 size={20} />
	</button>

	<button
		disabled={isFinal || !canRedo}
		data-demo-id="tool-redo"
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none {canRedo
			? 'border-slate-400/40 bg-slate-500/20 text-slate-50 hover:-translate-y-px hover:border-slate-300 hover:bg-slate-500/30 active:translate-y-0 active:bg-slate-500/40'
			: 'cursor-not-allowed border-white/10 bg-white/3 text-white/20 hover:translate-y-0 hover:bg-white/3'}"
		title="Redo (Cmd/Ctrl+Shift+Z)"
	>
		<Redo2 size={20} />
	</button>

	<div class="mx-2 h-8 w-px shrink-0 bg-white/15"></div>

	<!-- Mode Toggle -->
	<button
		disabled={isFinal}
		title={!isSelectMode ? 'Switch to Select mode (V)' : 'Switch to Draw mode (V)'}
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none {!isSelectMode
			? 'border-violet-200 bg-violet-500/45 text-violet-50 hover:-translate-y-px hover:bg-violet-500/55 active:translate-y-0 active:bg-violet-500/65'
			: 'border-violet-500/25 bg-violet-500/8 text-violet-200/70 hover:-translate-y-px hover:bg-violet-500/15 active:translate-y-0 active:bg-violet-500/25'}"
		data-demo-id="tool-draw"
		onclick={() => setMode(isSelectMode ? 'brush' : 'select', 'tool-draw')}
	>
		{#if isSelectMode}
			<SquareDashed size={18} />
		{:else}
			<Pencil size={18} />
		{/if}
	</button>

	<!-- Select mode Toggle -->
	<button
		disabled={isFinal}
		title={groupSelect ? 'Disable Group Select' : 'Enable Group Select'}
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none {groupSelect
			? 'border-violet-200 bg-violet-500/45 text-violet-50 hover:-translate-y-px hover:bg-violet-500/55 active:translate-y-0 active:bg-violet-500/65'
			: 'border-violet-500/25 bg-violet-500/8 text-violet-200/70 hover:-translate-y-px hover:bg-violet-500/15 active:translate-y-0 active:bg-violet-500/25'}"
		data-demo-id="tool-select"
		onclick={() => setGroupSelect(!groupSelect, 'tool-select')}
	>
		{#if groupSelect}
			<Wand size={18} />
		{:else}
			<Ungroup size={18} />
		{/if}
	</button>

	<!-- Eraser Toggle -->
	<button
		disabled={isFinal}
		title={isEraser ? 'Disable Eraser (E)' : 'Enable Eraser (E)'}
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none {isEraser
			? 'border-violet-200 bg-violet-500/50 text-violet-50 hover:-translate-y-px hover:bg-violet-500/60 active:translate-y-0 active:bg-violet-500/70'
			: 'border-violet-400/40 bg-violet-500/20 text-violet-100/90 hover:-translate-y-px hover:bg-violet-500/30 active:translate-y-0 active:bg-violet-500/40'}"
		data-demo-id="tool-eraser"
		onclick={() => setEraserMode(!isEraser, 'tool-eraser')}
	>
		<Eraser size={18} />
	</button>

	<div class="mx-2 h-8 w-px shrink-0 bg-white/15"></div>

	<!-- Brush Sizes -->
	<div class="flex shrink-0 items-center gap-2">
		{#each BRUSH_SIZES as size (size)}
			<button
				disabled={isFinal}
				onclick={() => {
					setMode('brush');
					setBrushSize(size, `size-${size}`);
				}}
				class="flex h-8 w-8 shrink-0 translate-y-0 items-center justify-center rounded-full transition-all hover:-translate-y-px {brushSize ===
				size
					? 'bg-white/30 ring-2 ring-white/50'
					: 'bg-white/10 hover:bg-white/20'}"
				aria-label="Brush size {size}px"
				title={`Brush size ${size}px`}
				data-demo-id="size-{size}"
			>
				<div class="rounded-full bg-white" style="width: {size}px; height: {size}px"></div>
			</button>
		{/each}
	</div>

	<div class="mx-2 h-8 w-px shrink-0 bg-white/15"></div>

	<ColorPalette
		dataPrefix="tool-color"
		color={brushColor}
		onChange={(color) => {
			setBrushColor(color, `tool-color-${color}`);
		}}
	/>

	<div class="flex h-full shrink-0 -translate-x-6 flex-row items-center lg:translate-x-0">
		<div class="mr-4 h-6 w-px shrink-0 bg-white/15"></div>

		<!-- Action Buttons -->
		<div class="flex shrink-0 items-center gap-2">
			<button
				disabled={isFinal}
				class="h-10 shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white"
				title="Clear canvas (with undo)"
			>
				Clear
			</button>
			<button
				disabled={isFinal}
				class="h-10 shrink-0 rounded-lg bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-300 transition-all hover:bg-red-500/30 hover:text-red-200"
				title="Reset canvas (clear history)"
			>
				Reset
			</button>
		</div>
	</div>
</div>
