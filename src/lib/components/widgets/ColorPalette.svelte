<script lang="ts">
	import { COLORS } from '$lib/utils/constants';

	interface Props {
		color: string;
		dataPrefix?: string;
		onChange?: (color: string) => void;
	}

	let { color, dataPrefix, onChange }: Props = $props();

	const colorEntries = Object.entries(COLORS);
	const arrowButtonClass =
		'absolute top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center lg:flex';
	const arrowFadeClass =
		'pointer-events-none absolute top-0 z-10 hidden h-full w-10 to-transparent lg:block';

	let colorScrollContainer: HTMLDivElement;
	let showLeftArrow = $state(false);
	let showRightArrow = $state(false);

	function updateScrollIndicators() {
		if (!colorScrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = colorScrollContainer;
		showLeftArrow = scrollLeft > 0;
		showRightArrow = scrollLeft < scrollWidth - clientWidth - 1;
	}

	function scrollColors(direction: 'left' | 'right') {
		if (!colorScrollContainer) return;
		const scrollAmount = 200;
		colorScrollContainer.scrollBy({
			left: direction === 'left' ? -scrollAmount : scrollAmount,
			behavior: 'smooth'
		});
	}

	$effect(() => {
		if (colorScrollContainer) {
			updateScrollIndicators();
			const resizeObserver = new ResizeObserver(updateScrollIndicators);
			resizeObserver.observe(colorScrollContainer);
			return () => resizeObserver.disconnect();
		}
	});
</script>

{#snippet arrowIcon()}
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path
			d="M15 18L9 12L15 6"
			stroke="black"
			stroke-width="5"
			stroke-linecap="round"
			stroke-linejoin="round"
			paint-order="stroke"
		/>
		<path
			d="M15 18L9 12L15 6"
			stroke="white"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			paint-order="stroke"
		/>
	</svg>
{/snippet}

<!-- Color Picker - Scrollable on lg, expanded on mobile -->
<div class="h-full -translate-x-4 lg:relative lg:min-w-0 lg:flex-1 lg:-translate-x-2">
	<!-- Left scroll indicator (lg+ only) -->
	{#if showLeftArrow}
		<div class="{arrowFadeClass} left-0 rounded-l-lg bg-linear-to-r from-gray-400/30"></div>
		<button
			onclick={() => scrollColors('left')}
			class="{arrowButtonClass} left-0.5"
			aria-label="Scroll left"
		>
			{@render arrowIcon()}
		</button>
	{/if}

	<div
		bind:this={colorScrollContainer}
		onscroll={updateScrollIndicators}
		class="scrollbar-hide flex h-full items-center gap-2 overflow-y-hidden p-4 lg:overflow-x-scroll"
	>
		{#each colorEntries as c (c[0])}
			{@const isSelected = color === c[1]}
			<button
				title={c[0]}
				onclick={() => {
					if (onChange) onChange(c[1]);
					color = c[1];
				}}
				class="h-8 w-8 shrink-0 rounded-full border-2 transition-all hover:-translate-y-px {isSelected
					? `scale-110 ring-2 ${c[1] === COLORS.white ? 'border-black ring-black/70' : 'border-white ring-white/70'}`
					: 'border-transparent hover:scale-105 hover:border-white/20'}"
				style="background-color: {c[1]}; {isSelected
					? `box-shadow: 0 6px 14px color-mix(in srgb, ${c[1]} 45%, transparent);`
					: ''}"
				aria-label="Color {c[0]}"
				data-demo-id={dataPrefix ? `${dataPrefix}-${c[1]}` : `color-${c[1]}`}
			></button>
		{/each}
	</div>

	<!-- Right scroll indicator (lg+ only) -->
	{#if showRightArrow}
		<div class="{arrowFadeClass} right-0 rounded-r-lg bg-linear-to-l from-gray-400/30"></div>
		<button
			onclick={() => scrollColors('right')}
			class="{arrowButtonClass} right-0.5"
			aria-label="Scroll right"
		>
			<div class="rotate-180">
				{@render arrowIcon()}
			</div>
		</button>
	{/if}
</div>

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
