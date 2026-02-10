<script lang="ts">
	import { fade } from 'svelte/transition';
	import { narration } from '$lib/stores/narration.svelte';
	import { demoCursor } from '$lib/stores/demoCursor.svelte';
</script>

{#if narration.visible && narration.current && demoCursor.visible}
	{#key narration.current.id}
		<div
			class="narration-bubble"
			style="left: {narration.pinnedX + 20}px; top: {narration.pinnedY + 20}px;"
			transition:fade={{ duration: 300 }}
		>
			<div class="bubble-content">
				<p class="narration-text">
					{narration.typedText}<span class="cursor" class:typing={narration.isTyping}>|</span>
				</p>
			</div>
			<div class="bubble-tail"></div>
		</div>
	{/key}
{/if}

<style>
	.narration-bubble {
		position: fixed;
		z-index: 10001;
		pointer-events: none;
		max-width: 400px;
		filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
	}

	.bubble-content {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 16px 24px;
		border-radius: 20px;
		position: relative;
	}

	.bubble-tail {
		position: absolute;
		top: -6px;
		left: 20px;
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-bottom: 8px solid #667eea;
		transform: translateX(-50%);
	}

	.narration-text {
		margin: 0;
		font-size: 18px;
		font-weight: 500;
		line-height: 1.5;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	.cursor {
		display: inline-block;
		margin-left: 2px;
		opacity: 0;
		animation: blink 0.8s infinite;
	}

	.cursor.typing {
		opacity: 1;
		animation: none;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}
</style>
