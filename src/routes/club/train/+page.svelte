<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { base } from '$app/paths';

	onMount(() => {
		goto(`${base}/train${$page.url.search}`, { replaceState: true });
	});
</script>
