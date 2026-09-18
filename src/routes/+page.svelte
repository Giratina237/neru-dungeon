<script lang="ts">
	import { onMount } from 'svelte';
	import { asset, base } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		CONFIG_STORAGE_KEY,
		DEFAULT_CONFIG,
		LEGACY_CONFIG_STORAGE_KEY,
		validateConfig,
	} from '$lib/club/grid';
	import { buildLessonList, sequenceCount } from '$lib/club/lessons';
	import KeyHistoryGrid from '$lib/club/KeyHistoryGrid.svelte';
	import {
		clearKeyHistory,
		getKeySummaries,
		getSlowestKeys,
		MAX_HISTORY_PER_KEY,
		type KeySummary,
	} from '$lib/club/stats';
	import { getInitialTheme, toggleTheme, type Theme } from '$lib/club/theme';
	import type { GridConfig, LessonDef } from '$lib/club/types';

	let rows = $state(DEFAULT_CONFIG.rows);
	let cols = $state(DEFAULT_CONFIG.cols);
	let keys = $state(DEFAULT_CONFIG.keys);
	let showHistory = $state(true);
	let theme = $state<Theme>('light');

	let config = $derived<GridConfig>({ rows, cols, keys: keys.toUpperCase() });
	let error = $derived(validateConfig(config));
	let isValid = $derived(error === null);
	let needed = $derived(rows * cols);

	let keySummaries = $state<KeySummary[]>([]);
	let isFullscreen = $state(false);
	let hasCompleteAttempts = $derived(
		keySummaries.some((s) => s.attempts > 0 && config.keys.toUpperCase().includes(s.key.toUpperCase())),
	);
	let slowestKeys = $derived(getSlowestKeys(keySummaries, 5));

	let lessons = $derived(isValid ? buildLessonList(config) : []);

	// Group lessons for display
	let groups = $derived(
		lessons.reduce<{ name: string; items: (LessonDef & { index: number })[] }[]>((acc, lesson, i) => {
			const last = acc[acc.length - 1];
			if (last && last.name === lesson.group) {
				last.items.push({ ...lesson, index: i });
			} else {
				acc.push({ name: lesson.group, items: [{ ...lesson, index: i }] });
			}
			return acc;
		}, []),
	);

	onMount(() => {
		const stored =
			localStorage.getItem(CONFIG_STORAGE_KEY) ??
			localStorage.getItem(LEGACY_CONFIG_STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as GridConfig;
				rows = parsed.rows;
				cols = parsed.cols;
				keys = parsed.keys;
			} catch {
				// ignore
			}
		}
		updateKeySummaries();
		theme = getInitialTheme();

		const updateFullscreen = () => {
			isFullscreen = !!document.fullscreenElement;
		};
		updateFullscreen();
		document.addEventListener('fullscreenchange', updateFullscreen);
		return () => {
			document.removeEventListener('fullscreenchange', updateFullscreen);
		};
	});

	function handleToggleTheme() {
		theme = toggleTheme(theme);
	}

	function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen().catch(() => {});
		}
	}

	function updateKeySummaries() {
		if (typeof window !== 'undefined') {
			keySummaries = getKeySummaries();
		}
	}

	function handleClearHistory() {
		clearKeyHistory();
		updateKeySummaries();
	}

	function startLesson(lessonId: string) {
		if (!isValid) return;
		localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
		if (typeof document !== 'undefined' && !document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		}
		goto(`${base}/train?lesson=${lessonId}`);
	}

	function startReview(key: string) {
		if (!isValid) return;
		localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
		if (typeof document !== 'undefined' && !document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		}
		goto(`${base}/train?lesson=review&review=${key}`);
	}
</script>

<svelte:head>
	<title>neru-dungeon</title>
	<link rel="icon" href={asset('/neru-dungeon-appicon.png')} />
</svelte:head>

<main
	class="min-h-screen bg-background-100 p-8 font-mono text-foreground-600"
>
	<div class="mx-auto flex max-w-3xl flex-col gap-10">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<img src={asset('/neru-dungeon-appicon.png')} alt="neru-dungeon logo" class="h-12 w-12 rounded-xl" />
				<h1 class="text-4xl">neru-dungeon</h1>
			</div>
			<div class="flex items-center gap-3">
				<button
					type="button"
					class="border-2 border-foreground-600 bg-background-100 px-4 py-2 text-xl outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
					onclick={handleToggleTheme}
					aria-label="Toggle theme"
				>
					{theme}
				</button>
				<button
					type="button"
					class="border-2 border-foreground-600 px-4 py-2 text-xl outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
					onclick={toggleFullscreen}
				>
					{isFullscreen ? 'exit fullscreen' : 'fullscreen'}
				</button>
			</div>
		</div>

		<!-- Config -->
		<div class="flex flex-col gap-5">
			<div class="flex gap-6">
				<label class="flex flex-col gap-1">
					<span class="text-xl">rows</span>
					<input
						type="number"
						min="1"
						max="5"
						bind:value={rows}
						class="w-24 border-2 border-foreground-600 bg-background-100 px-3 py-2 text-2xl outline-none focus-visible:border-highlight-600"
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-xl">cols</span>
					<input
						type="number"
						min="1"
						max="5"
						bind:value={cols}
						class="w-24 border-2 border-foreground-600 bg-background-100 px-3 py-2 text-2xl outline-none focus-visible:border-highlight-600"
					/>
				</label>
			</div>
			<label class="flex flex-col gap-1">
				<span class="text-xl">keys — {keys.length}/{needed}</span>
				<input
					type="text"
					bind:value={keys}
					class="border-2 bg-background-100 px-3 py-2 text-2xl uppercase tracking-widest outline-none focus-visible:border-highlight-600"
					class:border-foreground-600={!isValid}
					class:border-highlight-600={isValid}
					placeholder="one char per cell, row by row"
				/>
				{#if error}
					<span class="text-xl text-foreground-400">{error}</span>
				{/if}
			</label>
		</div>

		<!-- Review Mode Section -->
		{#if isValid}
			<div class="flex flex-col gap-3 border-2 border-foreground-600 p-5">
				<div class="flex items-center justify-between">
					<span class="text-xl font-medium">review mode</span>
					<span class="text-sm text-foreground-400">10 tests: 5 depth-2 + 5 depth-3</span>
				</div>
				{#if slowestKeys.length > 0}
					<div class="flex flex-col gap-1.5 pb-2 border-b border-foreground-300">
						<span class="text-xs text-foreground-400">slowest keys:</span>
						<div class="flex flex-wrap gap-2">
							{#each slowestKeys as item, index (item.key)}
								<button
									type="button"
									class="flex items-center gap-2 border-2 border-foreground-600 px-3 py-1 text-base outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
									onclick={() => startReview(item.key)}
									title="{item.key}: {item.avgReactionMs}ms, {item.accuracyPct}% acc"
								>
									<span class="text-xs text-foreground-400">#{index + 1}</span>
									<span class="font-bold">{item.key}</span>
									<span class="text-xs opacity-80">{item.avgReactionMs}ms</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
				<span class="text-sm text-foreground-400">
					pick any key to drill specifically (interleaved with random keys):
				</span>
				<div class="flex flex-wrap gap-2 pt-1">
					{#each [...config.keys.toUpperCase()] as key (key)}
						<button
							type="button"
							class="flex h-10 w-10 items-center justify-center border-2 border-foreground-600 text-xl font-bold outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
							onclick={() => startReview(key)}
						>
							{key}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Lesson list -->
		{#if isValid && groups.length > 0}
			<div class="flex flex-col gap-10">
				{#each groups as group (group.name)}
					<div class="flex flex-col gap-4">
						<div class="flex items-baseline justify-between border-b-2 border-foreground-600 pb-2">
							<h3 class="text-3xl font-bold capitalize">{group.name}</h3>
							<span class="text-sm text-foreground-400">
								{group.items.length} {group.items.length === 1 ? 'lesson' : 'lessons'}
							</span>
						</div>
						<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
							{#each group.items as lesson (lesson.id)}
								<button
									type="button"
									onclick={() => startLesson(lesson.id)}
									class="group relative flex flex-col justify-between border-2 border-foreground-600 bg-background-100 p-4 text-left outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600 min-h-[140px] sm:min-h-[160px] transition-colors"
								>
									<!-- Card Header: Lesson Number & Seq Count -->
									<div class="flex items-start justify-between w-full">
										<span class="text-2xl font-bold leading-none">{lesson.index + 1}</span>
										<span class="text-xs text-foreground-400 group-hover:text-background-100/80">
											{sequenceCount(lesson)} seq
										</span>
									</div>

									<!-- Card Center: Focal Point -->
									<div class="flex flex-col items-center justify-center my-3 text-center">
										{#if lesson.kind === 'intro'}
											<span class="text-3xl sm:text-4xl font-black tracking-wider leading-none">
												{lesson.keys.join(' ')}
											</span>
										{:else if lesson.kind === 'row'}
											<span class="text-2xl sm:text-3xl font-black tracking-widest leading-none">
												ALL
											</span>
											<span class="text-[11px] opacity-75 mt-1 tracking-wider">
												{lesson.keys.join(' ')}
											</span>
										{:else if lesson.kind === 'column'}
											<span class="text-2xl sm:text-3xl font-black tracking-wider leading-none">
												COL {lesson.id.replace('c', '') !== '' ? parseInt(lesson.id.replace('c', '')) + 1 : ''}
											</span>
											<span class="text-[11px] opacity-75 mt-1 tracking-wider">
												{lesson.keys.join(' ')}
											</span>
										{:else}
											<span class="text-2xl sm:text-3xl font-black tracking-wider leading-none">
												GRID
											</span>
											<span class="text-[11px] opacity-75 mt-1 tracking-wider">
												all keys
											</span>
										{/if}
									</div>

									<!-- Card Footer: Label -->
									<div class="border-t border-foreground-600/30 group-hover:border-background-100/30 pt-2 text-center text-xs font-medium truncate w-full">
										{lesson.label}
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Key History Summary (Last 10 presses) -->
		<div class="flex flex-col gap-4 border-t-2 border-foreground-600 pt-6">
			<div class="flex items-center justify-between">
				<span class="text-xl font-medium">key history (last {MAX_HISTORY_PER_KEY} presses)</span>
				{#if hasCompleteAttempts}
					<button
						type="button"
						class="text-sm text-foreground-400 underline outline-none hover:text-foreground-600 focus-visible:text-highlight-600"
						onclick={() => (showHistory = !showHistory)}
					>
						{showHistory ? 'hide' : 'show'}
					</button>
				{/if}
			</div>
			{#if !hasCompleteAttempts}
				<div class="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-foreground-600 p-8 text-center bg-background-100">
					<p class="text-base text-foreground-400">
						try playing complete grid to get key history analysis
					</p>
					<button
						type="button"
						class="border-2 border-foreground-600 px-4 py-2 text-base outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
						onclick={() => startLesson('complete')}
					>
						play complete grid
					</button>
				</div>
			{:else if showHistory}
				<KeyHistoryGrid
					{config}
					{keySummaries}
					maxAttempts={MAX_HISTORY_PER_KEY}
					onSelectKey={startReview}
					onClearHistory={handleClearHistory}
				/>
			{/if}
		</div>

		<!-- Credits -->
		<footer class="flex items-center justify-between border-t-2 border-foreground-600 pt-6 text-sm text-foreground-400">
			<span>inspired by neru dojo</span>
			<span>made by giratina</span>
		</footer>
	</div>
</main>
