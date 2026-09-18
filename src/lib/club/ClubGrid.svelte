<script lang="ts">
	import { computeRegion } from './grid';
	import type { GridConfig } from './types';

	let {
		config,
		sequence,
		inputKeys = [],
		isSingleDepth = false,
		reflashKey = 0,
		resetting = false,
	}: {
		config: GridConfig;
		sequence: readonly string[];
		inputKeys?: readonly string[];
		isSingleDepth?: boolean;
		reflashKey?: number;
		resetting?: boolean;
	} = $props();

	// In single-depth mode, target highlights the current letter of the word
	let activeTargetSequence = $derived(
		isSingleDepth ? [sequence[inputKeys.length] ?? sequence[0] ?? ''] : sequence,
	);

	let target = $derived(computeRegion(config, activeTargetSequence));
	let nav = $derived(isSingleDepth ? computeRegion(config, []) : computeRegion(config, inputKeys));

	let showPartitions = $derived(
		isSingleDepth ? true : inputKeys.length < sequence.length,
	);

	let hLines = $derived(
		showPartitions
			? Array.from(
					{ length: config.rows - 1 },
					(_, i) => nav.top + ((i + 1) / config.rows) * nav.height,
				)
			: [],
	);

	let vLines = $derived(
		showPartitions
			? Array.from(
					{ length: config.cols - 1 },
					(_, i) => nav.left + ((i + 1) / config.cols) * nav.width,
				)
			: [],
	);
</script>

<div class="relative h-full w-full overflow-hidden bg-background-100">
	<!-- Target region: flashes white when resetting or reflashing on same location -->
	{#if !resetting}
		{#key reflashKey}
			<div
				class="absolute bg-highlight-500"
				class:reflash-target={reflashKey > 0}
				style="top: {target.top}%; left: {target.left}%; width: {target.width}%; height: {target.height}%"
			></div>
		{/key}
	{/if}

	<!-- Nav border — starts at full area, shrinks with each key press in recursive mode -->
	<div
		class="absolute border-2 border-foreground-600"
		style="top: {nav.top}%; left: {nav.left}%; width: {nav.width}%; height: {nav.height}%"
	></div>

	{#if !resetting}
		<!-- Horizontal partition lines inside nav region (between rows) -->
		{#each hLines as y (y)}
			<div
				class="absolute h-px bg-foreground-600"
				style="top: {y}%; left: {nav.left}%; width: {nav.width}%"
			></div>
		{/each}

		<!-- Vertical partition lines inside nav region (between cols) -->
		{#each vLines as x (x)}
			<div
				class="absolute w-px bg-foreground-600"
				style="left: {x}%; top: {nav.top}%; height: {nav.height}%"
			></div>
		{/each}
	{/if}
</div>

<style>
	@keyframes reflash {
		0% {
			opacity: 0;
		}
		50% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.reflash-target {
		animation: reflash 75ms ease-out;
	}
</style>
