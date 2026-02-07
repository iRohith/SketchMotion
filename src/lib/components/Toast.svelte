<script lang="ts">
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { toastState } from '$lib/stores/toast.svelte';
	import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from '@lucide/svelte';

	const iconMap = {
		error: AlertCircle,
		success: CheckCircle,
		info: Info,
		warning: AlertTriangle
	};

	const colorMap = {
		error: 'border-red-500/50 bg-red-950/80 text-red-200',
		success: 'border-green-500/50 bg-green-950/80 text-green-200',
		info: 'border-blue-500/50 bg-blue-950/80 text-blue-200',
		warning: 'border-yellow-500/50 bg-yellow-950/80 text-yellow-200'
	};

	const iconColorMap = {
		error: 'text-red-400',
		success: 'text-green-400',
		info: 'text-blue-400',
		warning: 'text-yellow-400'
	};
</script>

<!-- Toast Container -->
<div class="pointer-events-none fixed right-4 bottom-4 z-9999 flex flex-col gap-2">
	{#each toastState.toasts as toast (toast.id)}
		{@const Icon = iconMap[toast.type]}
		<div
			animate:flip={{ duration: 200 }}
			transition:slide={{ duration: 200 }}
			class="pointer-events-auto flex min-w-80 items-start gap-3 rounded-lg border p-4 shadow-xl backdrop-blur-md {colorMap[
				toast.type
			]}"
			role="alert"
		>
			<Icon class="mt-0.5 h-5 w-5 shrink-0 {iconColorMap[toast.type]}" />
			<p class="grow text-sm leading-relaxed">{toast.message}</p>
			<button
				onclick={() => toastState.dismiss(toast.id)}
				class="shrink-0 text-white/50 transition-colors hover:text-white/80"
				aria-label="Dismiss"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/each}
</div>
