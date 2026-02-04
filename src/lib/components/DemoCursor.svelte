<script lang="ts">
	import {
		demoCursor,
		initLayoutRegistry,
		cleanupLayoutRegistry
	} from '$lib/stores/demoCursor.svelte';

	$effect(() => {
		if (demoCursor.visible) {
			initLayoutRegistry();
			return cleanupLayoutRegistry;
		}
	});
</script>

{#if demoCursor.visible}
	<div
		class="demo-cursor pointer-events-none fixed z-9999"
		style="left: {demoCursor.x}px; top: {demoCursor.y}px;"
	>
		<!-- Cursor pointer -->
		<svg
			width="32"
			height="32"
			viewBox="0 0 32 32"
			fill="none"
			class="drop-shadow-lg transition-transform duration-75"
			class:-rotate-12={demoCursor.clicking || demoCursor.dragging}
		>
			<!-- Pointer shape with gradient -->
			<path
				d="M8 4L24 16L16 18L12 28L8 4Z"
				fill="url(#cursorGradient)"
				stroke="white"
				stroke-width="2"
				stroke-linejoin="round"
			/>
			<defs>
				<linearGradient
					id="cursorGradient"
					x1="8"
					y1="4"
					x2="20"
					y2="24"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#ec4899" />
					<stop offset="1" stop-color="#8b5cf6" />
				</linearGradient>
			</defs>
		</svg>

		<!-- Click/drag ripple effect -->
		{#if demoCursor.clicking || demoCursor.dragging}
			<div
				class="absolute top-4 left-4 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-75"
				class:bg-cyan-400={!demoCursor.dragging}
				class:bg-purple-400={demoCursor.dragging}
			></div>
			<div
				class="absolute top-4 left-4 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
				class:bg-cyan-500={!demoCursor.dragging}
				class:bg-purple-500={demoCursor.dragging}
			></div>
		{/if}
	</div>
{/if}

<style>
	.demo-cursor {
		transform: translate(-4px, -4px);
	}
</style>
