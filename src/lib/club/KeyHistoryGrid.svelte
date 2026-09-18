<script lang="ts">
	import { getSlowestKeys, type KeySummary } from './stats';
	import type { GridConfig } from './types';

	let {
		config,
		keySummaries,
		onSelectKey,
		onClearHistory,
	}: {
		config: GridConfig;
		keySummaries: KeySummary[];
		onSelectKey?: (key: string) => void;
		onClearHistory?: () => void;
	} = $props();

	let currentKeysUpper = $derived([...config.keys.toUpperCase()]);

	let activeSummaries = $derived(
		keySummaries.filter(
			(s) => s.attempts > 0 && currentKeysUpper.includes(s.key.toUpperCase()),
		),
	);

	let slowestKeys = $derived(getSlowestKeys(activeSummaries, 5));

	function getKeyColor(summary: KeySummary | undefined): { bg: string; text: string } {
		if (!summary || summary.attempts === 0) {
			return { bg: 'transparent', text: 'var(--foreground-400)' };
		}

		const rt = summary.avgReactionMs;
		// Thresholds:
		// <= 400ms: green (t = 1.0)
		// 400ms - 800ms: goes towards amber/middle (t: 1.0 -> 0.5)
		// 800ms - 1000ms: goes towards red (t: 0.5 -> 0.0)
		// >= 1000ms: red (t = 0.0)
		let t: number;
		if (rt <= 400) {
			t = 1.0;
		} else if (rt <= 800) {
			const p = (rt - 400) / 400;
			t = 1.0 - 0.5 * p;
		} else if (rt < 1000) {
			const p = (rt - 800) / 200;
			t = 0.5 - 0.5 * p;
		} else {
			t = 0.0;
		}

		// Piecewise interpolation: Red rgb(220, 38, 38) -> Amber rgb(217, 119, 6) -> Green rgb(22, 163, 74)
		let r: number;
		let g: number;
		let b: number;

		if (t <= 0.5) {
			const p = t / 0.5;
			r = Math.round(220 + p * (217 - 220));
			g = Math.round(38 + p * (119 - 38));
			b = Math.round(38 + p * (6 - 38));
		} else {
			const p = (t - 0.5) / 0.5;
			r = Math.round(217 + p * (22 - 217));
			g = Math.round(119 + p * (163 - 119));
			b = Math.round(6 + p * (74 - 6));
		}

		return {
			bg: `rgb(${r}, ${g}, ${b})`,
			text: '#ffffff',
		};
	}

	let gridCells = $derived.by(() => {
		const totalCells = config.rows * config.cols;
		const upperKeys = config.keys.toUpperCase();
		const cells = [];

		for (let i = 0; i < totalCells; i++) {
			const key = upperKeys[i] ?? '';
			const row = Math.floor(i / config.cols);
			const col = i % config.cols;
			const summary = key ? keySummaries.find((s) => s.key.toUpperCase() === key) : undefined;
			const color = getKeyColor(summary);
			const hasData = !!summary && summary.attempts > 0;

			cells.push({
				index: i,
				key,
				row,
				col,
				summary,
				color,
				hasData,
				title: key
					? hasData
						? `${key}: ${summary.avgReactionMs}ms, ${summary.accuracyPct}% acc (${summary.attempts}/30) — click to review`
						: `${key}: no attempts yet`
					: 'empty cell',
			});
		}

		return cells;
	});

	let fontSizeClass = $derived.by(() => {
		const maxDim = Math.max(config.rows, config.cols);
		if (maxDim <= 2) return 'text-4xl sm:text-5xl';
		if (maxDim <= 3) return 'text-3xl sm:text-4xl';
		if (maxDim <= 4) return 'text-2xl sm:text-3xl';
		return 'text-xl sm:text-2xl';
	});
</script>

<div class="flex flex-col gap-3 font-mono text-foreground-600">
	<!-- Legend header -->
	{#if activeSummaries.length > 0}
		<div class="flex items-center justify-end gap-2 text-xs">
			<span class="text-foreground-400">&gt; 1s (slowest)</span>
			<div
				class="h-2.5 w-24 border border-foreground-600"
				style="background: linear-gradient(to right, rgb(220, 38, 38), rgb(217, 119, 6), rgb(22, 163, 74));"
			></div>
			<span class="text-foreground-400">&lt; 400ms (fastest)</span>
		</div>
	{/if}

	<!-- rgrid-style board -->
	<div
		class="relative grid w-full aspect-video min-h-[200px] max-h-[380px] border-2 border-foreground-600 bg-background-100 overflow-hidden"
		style="grid-template-columns: repeat({config.cols}, 1fr); grid-template-rows: repeat({config.rows}, 1fr);"
	>
		{#each gridCells as cell (cell.index)}
			{@const hasBottomBorder = cell.row < config.rows - 1}
			{@const hasRightBorder = cell.col < config.cols - 1}
			<button
				type="button"
				class="relative flex flex-col items-center justify-center p-2 outline-none select-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-highlight-600"
				class:border-b={hasBottomBorder}
				class:border-r={hasRightBorder}
				class:border-foreground-600={hasBottomBorder || hasRightBorder}
				class:cursor-pointer={!!cell.key && !!onSelectKey}
				class:cursor-default={!cell.key || !onSelectKey}
				class:hover:brightness-95={cell.hasData && !!onSelectKey}
				class:dark:hover:brightness-110={cell.hasData && !!onSelectKey}
				class:hover:bg-background-200={!cell.hasData && !!cell.key && !!onSelectKey}
				style="background-color: {cell.color.bg}; color: {cell.color.text};"
				onclick={() => {
					if (cell.key && onSelectKey) onSelectKey(cell.key);
				}}
				title={cell.title}
				disabled={!cell.key}
			>
				{#if cell.key}
					<span
						class="{fontSizeClass} font-bold leading-none tracking-wide"
						class:drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]={cell.hasData}
					>
						{cell.key}
					</span>
					{#if cell.hasData && cell.summary}
						<div
							class="mt-2 flex flex-col items-center gap-0.5 text-center leading-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
						>
							<span class="text-xs sm:text-sm font-semibold">{cell.summary.avgReactionMs}ms</span>
							<span class="text-[11px] sm:text-xs opacity-90">{cell.summary.accuracyPct}%</span>
						</div>
					{:else}
						<span class="mt-2 text-xs opacity-60">—</span>
					{/if}
				{/if}
			</button>
		{/each}
	</div>

	<!-- Top 5 slowest keys -->
	{#if slowestKeys.length > 0}
		<div class="flex flex-col gap-2 border-2 border-foreground-600 bg-background-100 p-3">
			<div class="flex items-center justify-between text-xs text-foreground-400">
				<span class="font-medium uppercase tracking-wider text-foreground-600">top {slowestKeys.length} slowest keys</span>
				{#if onSelectKey}
					<span>click to drill</span>
				{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				{#each slowestKeys as item, index (item.key)}
					<button
						type="button"
						class="flex items-center gap-2 border-2 border-foreground-600 px-3 py-1.5 outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
						onclick={() => onSelectKey?.(item.key)}
						title="{item.key}: {item.avgReactionMs}ms, {item.accuracyPct}% acc — click to review"
					>
						<span class="text-xs text-foreground-400">#{index + 1}</span>
						<span class="text-xl font-bold">{item.key}</span>
						<span class="text-sm font-semibold">{item.avgReactionMs}ms</span>
						<span class="text-xs opacity-75">{item.accuracyPct}%</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Hint & Actions -->
	<div class="flex items-center justify-between text-xs text-foreground-400">
		<span>{onSelectKey ? 'click any key in the grid to review' : ''}</span>
		{#if onClearHistory && activeSummaries.length > 0}
			<button
				type="button"
				class="underline outline-none hover:text-foreground-600"
				onclick={onClearHistory}
			>
				clear key history
			</button>
		{/if}
	</div>
</div>
