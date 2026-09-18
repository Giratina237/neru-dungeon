<script lang="ts">
	import { base } from '$app/paths';
	import { formatElapsed } from './time';
	import KeyHistoryGrid from './KeyHistoryGrid.svelte';
	import type { KeySummary, SessionResult } from './stats';
	import type { GridConfig, Segment } from './types';

	let {
		result,
		config,
		keySummaries,
		segment = 'recall',
		onRestart,
		onStartRecall,
		onStartReview,
		onClearHistory,
	}: {
		result: SessionResult;
		config: GridConfig;
		keySummaries: KeySummary[];
		segment?: Segment;
		onRestart: () => void;
		onStartRecall?: () => void;
		onStartReview?: (key: string) => void;
		onClearHistory?: () => void;
	} = $props();

	let showKeyHistory = $state(true);
</script>

<div class="flex flex-1 flex-col items-center justify-center p-6 font-mono text-foreground-600 overflow-y-auto">
	<div class="w-full max-w-2xl border-2 border-foreground-600 bg-background-100 p-8 flex flex-col gap-6">
		<div class="flex items-center justify-between border-b-2 border-foreground-600 pb-4">
			<h2 class="text-3xl font-medium">test complete</h2>
			<span class="text-xl text-foreground-400">{result.totalWords} words completed</span>
		</div>

		<!-- Current Test Metrics -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2">
			<div class="flex flex-col gap-1 border-2 border-foreground-600 p-3">
				<span class="text-sm text-foreground-400">reaction / word</span>
				<span class="text-2xl font-bold">{result.avgReactionTimePerWordMs} ms</span>
			</div>
			<div class="flex flex-col gap-1 border-2 border-foreground-600 p-3">
				<span class="text-sm text-foreground-400">accuracy</span>
				<span class="text-2xl font-bold">{result.accuracyPct}%</span>
			</div>
			<div class="flex flex-col gap-1 border-2 border-foreground-600 p-3">
				<span class="text-sm text-foreground-400">misses</span>
				<span class="text-2xl font-bold">{result.misses}</span>
			</div>
			<div class="flex flex-col gap-1 border-2 border-foreground-600 p-3">
				<span class="text-sm text-foreground-400">total time</span>
				<span class="text-2xl font-bold">{formatElapsed(result.totalTimeMs)}</span>
			</div>
		</div>

		<!-- Key Summary (Last 30 attempts) -->
		<div class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<span class="text-xl font-medium">key history (last 30 attempts)</span>
				<button
					type="button"
					class="text-sm text-foreground-400 underline outline-none hover:text-foreground-600 focus-visible:text-highlight-600"
					onclick={() => (showKeyHistory = !showKeyHistory)}
				>
					{showKeyHistory ? 'hide' : 'show'}
				</button>
			</div>

			{#if showKeyHistory}
				<KeyHistoryGrid
					{config}
					{keySummaries}
					onSelectKey={onStartReview}
				/>
			{/if}
		</div>

		<!-- Action buttons -->
		<div class="flex flex-wrap items-center gap-4 pt-4 border-t-2 border-foreground-600">
			<button
				type="button"
				class="border-2 border-highlight-600 bg-highlight-500 px-6 py-3 text-xl text-background-100 outline-none hover:bg-highlight-600 focus-visible:border-foreground-600"
				onclick={onRestart}
			>
				retry ({segment})
			</button>
			{#if onStartRecall}
				<button
					type="button"
					class="border-2 border-foreground-600 bg-background-100 px-6 py-3 text-xl text-foreground-600 outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
					onclick={onStartRecall}
				>
					{segment === 'guided' ? 'try recall mode' : 'try guided mode'}
				</button>
			{/if}
			<a
				href="{base}/"
				class="border-2 border-foreground-600 px-6 py-3 text-xl outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
			>
				all lessons
			</a>
			{#if onClearHistory && keySummaries.length > 0}
				<button
					type="button"
					class="ml-auto border-2 border-foreground-600 px-4 py-3 text-sm text-foreground-400 outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
					onclick={onClearHistory}
				>
					clear key history
				</button>
			{/if}
		</div>
	</div>
</div>
