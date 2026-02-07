<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Toast from '$lib/components/Toast.svelte';

	import SessionManager from '$lib/components/SessionManager.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<Toast />
<SessionManager />
{@render children()}
