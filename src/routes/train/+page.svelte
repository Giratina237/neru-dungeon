<script lang="ts">
	import { onMount } from 'svelte';
	import { asset, base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import ClubGrid from '$lib/club/ClubGrid.svelte';
	import ClubResults from '$lib/club/ClubResults.svelte';
	import {
		computeRegion,
		CONFIG_STORAGE_KEY,
		DEFAULT_CONFIG,
		LEGACY_CONFIG_STORAGE_KEY,
		MODE_STORAGE_KEY,
	} from '$lib/club/grid';
	import { buildLessonList, buildSessionSequences } from '$lib/club/lessons';
	import {
		clearKeyHistory,
		getKeySummaries,
		type KeySummary,
		type SessionResult,
		saveKeyAttempts,
	} from '$lib/club/stats';
	import type { GridConfig, LessonDef, Segment, Sequence } from '$lib/club/types';

	let config = $state<GridConfig>(DEFAULT_CONFIG);
	let lesson = $state<LessonDef | null>(null);
	let sequences = $state<Sequence[]>([]);
	let ready = $state(false);

	let segment = $state<Segment>('recall');
	let taskIndex = $state(0);
	let inputKeys = $state<string[]>([]);
	let done = $state(false);
	let reflashKey = $state(0);
	let mistakeKey = $state(0);
	let isFullscreen = $state(false);

	// Timing and metrics
	let taskStartTime = $state(0);
	let keyStartTime = $state(0);
	let correctPresses = $state(0);
	let missPresses = $state(0);
	let wordDurations = $state<number[]>([]);
	let keyAttempts = $state<Array<{ key: string; reactionTimeMs: number; correct: boolean }>>([]);

	let sessionResult = $state<SessionResult | null>(null);
	let keySummaries = $state<KeySummary[]>([]);

	let total = $derived(sequences.length);
	let currentSeq = $derived(sequences[taskIndex] ?? []);
	let lessonId = $derived($page.url.searchParams.get('lesson') ?? '');
	let reviewParam = $derived($page.url.searchParams.get('review') ?? '');

	let isDoubleWordTest = $derived(lesson?.kind === 'intro');

	type Region = { top: number; left: number; width: number; height: number };

	function isSameRegion(r1: Region | null, r2: Region | null): boolean {
		if (!r1 || !r2) return false;
		return (
			Math.abs(r1.top - r2.top) < 0.001 &&
			Math.abs(r1.left - r2.left) < 0.001 &&
			Math.abs(r1.width - r2.width) < 0.001 &&
			Math.abs(r1.height - r2.height) < 0.001
		);
	}

	function getTargetRegion(tIndex: number, inKeys: string[]): Region | null {
		if (sequences.length === 0 || tIndex >= sequences.length) return null;
		const seq = sequences[tIndex];
		if (!seq || seq.length === 0) return null;
		const activeSeq = isDoubleWordTest
			? [seq[inKeys.length] ?? seq[0] ?? '']
			: seq;
		return computeRegion(config, activeSeq);
	}

	let lastTargetRegion: Region | null = null;

	function setSegment(newSegment: Segment) {
		segment = newSegment;
		if (typeof window !== 'undefined') {
			localStorage.setItem(MODE_STORAGE_KEY, newSegment);
		}
	}

	function toggleSegment() {
		setSegment(segment === 'guided' ? 'recall' : 'guided');
	}

	onMount(() => {
		const stored =
			localStorage.getItem(CONFIG_STORAGE_KEY) ??
			localStorage.getItem(LEGACY_CONFIG_STORAGE_KEY);
		if (!stored) { goto(`${base}/`); return; }

		try {
			config = JSON.parse(stored) as GridConfig;
		} catch {
			goto(`${base}/`);
			return;
		}

		const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
		if (savedMode === 'recall' || savedMode === 'guided') {
			segment = savedMode;
		}

		if (lessonId === 'review' || reviewParam) {
			const targetKey = (reviewParam || config.keys[0] || 'Q').toUpperCase();
			lesson = {
				id: `review-${targetKey}`,
				label: `review (${targetKey})`,
				group: 'review mode',
				kind: 'review',
				keys: [targetKey],
				reviewKey: targetKey,
			};
			sequences = buildSessionSequences(lesson, config);
			ready = true;
			lastTargetRegion = getTargetRegion(0, []);
		} else {
			const list = buildLessonList(config);
			const found = list.find((l) => l.id === lessonId);
			if (!found) { goto(`${base}/`); return; }

			lesson = found;
			sequences = buildSessionSequences(found, config);
			ready = true;
			lastTargetRegion = getTargetRegion(0, []);
		}

		const now = performance.now();
		taskStartTime = now;
		keyStartTime = now;

		if (typeof document !== 'undefined' && !document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		}

		const updateFullscreen = () => {
			isFullscreen = !!document.fullscreenElement;
		};
		updateFullscreen();
		document.addEventListener('fullscreenchange', updateFullscreen);
		return () => {
			document.removeEventListener('fullscreenchange', updateFullscreen);
		};
	});

	function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen().catch(() => {});
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (typeof document !== 'undefined' && document.fullscreenElement) {
				document.exitFullscreen().catch(() => {});
			} else {
				goto(`${base}/`);
			}
			return;
		}

		// Ctrl+K or Cmd+K toggles guided/recall mode at any time
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			toggleSegment();
			return;
		}

		if (!ready || done || event.metaKey || event.ctrlKey || event.altKey) return;

		// Ensure native fullscreen is active if possible upon typing
		if (typeof document !== 'undefined' && !document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		}

		const key = event.key.toUpperCase();
		if (!config.keys.toUpperCase().includes(key)) return;
		event.preventDefault();

		const expected = currentSeq[inputKeys.length]?.toUpperCase();
		const now = performance.now();
		const reactionTimeMs = Math.max(1, now - (keyStartTime || taskStartTime || now));

		if (key === expected) {
			const nextInput = [...inputKeys, key];
			keyAttempts.push({ key, reactionTimeMs, correct: true });
			correctPresses++;
			keyStartTime = now;

			if (nextInput.length === currentSeq.length) {
				wordDurations.push(now - taskStartTime);
				const nextTask = taskIndex + 1;
				if (nextTask >= total) {
					finishSession();
				} else {
					// Check if next task's target is in the exact same location as previous target
					const nextRegion = getTargetRegion(nextTask, []);
					if (isSameRegion(lastTargetRegion, nextRegion)) {
						reflashKey += 1;
					}
					lastTargetRegion = nextRegion;

					taskIndex = nextTask;
					inputKeys = [];
					taskStartTime = performance.now();
					keyStartTime = taskStartTime;
				}
			} else {
				// Intermediate key inside the sequence (e.g. in intro lessons)
				const nextRegion = getTargetRegion(taskIndex, nextInput);
				if (isSameRegion(lastTargetRegion, nextRegion)) {
					reflashKey += 1;
				}
				lastTargetRegion = nextRegion;

				inputKeys = nextInput;
			}
		} else {
			mistakeKey += 1;
			keyAttempts.push({ key: expected, reactionTimeMs, correct: false });
			missPresses++;
			keyStartTime = now;
		}
	}

	function finishSession() {
		done = true;

		// Save key attempts to persistent rolling window only for complete grid
		if (lesson?.id === 'complete' || lesson?.kind === 'grid') {
			saveKeyAttempts(keyAttempts);
		}
		keySummaries = getKeySummaries();

		const totalWords = wordDurations.length;
		const totalTimeMs = wordDurations.reduce((a, b) => a + b, 0);
		const avgReactionTimePerWordMs =
			totalWords > 0 ? Math.round(totalTimeMs / totalWords) : 0;
		const totalPresses = correctPresses + missPresses;
		const accuracyPct =
			totalPresses > 0 ? Math.round((correctPresses / totalPresses) * 100) : 100;

		sessionResult = {
			totalWords,
			totalTimeMs,
			avgReactionTimePerWordMs,
			accuracyPct,
			correctPresses,
			misses: missPresses,
		};
	}

	function handleClearHistory() {
		clearKeyHistory();
		keySummaries = getKeySummaries();
	}

	function startReview(key: string) {
		const targetKey = key.toUpperCase();
		lesson = {
			id: `review-${targetKey}`,
			label: `review (${targetKey})`,
			group: 'review mode',
			kind: 'review',
			keys: [targetKey],
			reviewKey: targetKey,
		};
		restart();
		goto(`${base}/train?lesson=review&review=${targetKey}`, { replaceState: true });
	}

	function restart(nextSegment?: Segment) {
		if (typeof document !== 'undefined' && !document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		}
		sequences = lesson ? buildSessionSequences(lesson, config) : [];
		if (nextSegment) {
			segment = nextSegment;
		}
		taskIndex = 0;
		inputKeys = [];
		reflashKey = 0;
		mistakeKey = 0;
		done = false;
		correctPresses = 0;
		missPresses = 0;
		wordDurations = [];
		keyAttempts = [];
		sessionResult = null;
		lastTargetRegion = getTargetRegion(0, []);

		const now = performance.now();
		taskStartTime = now;
		keyStartTime = now;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>neru-dungeon — {lesson?.label ?? 'train'}</title>
	<link rel="icon" href={asset('/neru-dungeon-appicon.png')} />
</svelte:head>

{#if !ready}
	<main class="flex h-screen flex-col items-center justify-center bg-background-100 p-6 font-mono text-2xl text-foreground-400">
		loading…
	</main>
{:else if done && sessionResult}
	<main class="flex h-screen flex-col bg-background-100 p-6 font-mono text-foreground-600">
		<!-- Header -->
		<div class="grid grid-cols-[auto_1fr_auto] items-center gap-4">
			<a
				href="{base}/"
				class="border-2 border-foreground-600 px-4 py-2 text-xl outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
			>
				← back
			</a>
			<div class="flex items-center justify-center text-2xl">
				{#if lesson}
					<span class="text-foreground-400">{lesson.label}</span>
				{/if}
			</div>
			<div class="flex justify-end">
				<button
					type="button"
					class="border-2 border-foreground-600 px-4 py-2 text-xl outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
					onclick={toggleFullscreen}
				>
					{isFullscreen ? 'exit fullscreen' : 'fullscreen'}
				</button>
			</div>
		</div>
		<ClubResults
			result={sessionResult}
			{config}
			{keySummaries}
			{segment}
			onRestart={() => restart()}
			onStartRecall={() => restart(segment === 'guided' ? 'recall' : 'guided')}
			onStartReview={startReview}
			onClearHistory={handleClearHistory}
		/>
	</main>
{:else}
	<!-- Training Mode: Grid always occupies the entire screen -->
	<div class="fixed inset-0 z-40 bg-background-100 font-mono text-foreground-600 select-none overflow-hidden">
		<!-- Full-screen Grid -->
		<div class="h-full w-full">
			<ClubGrid
				{config}
				sequence={currentSeq}
				isSingleDepth={isDoubleWordTest}
				{inputKeys}
				{reflashKey}
			/>
		</div>

		<!-- Guided Sequence Prompt (clean floating text, no blocking background) -->
		{#if segment === 'guided'}
			<div class="pointer-events-none absolute top-4 inset-x-0 flex justify-center z-30">
				<div class="flex items-center gap-3 text-3xl font-bold tracking-wider select-none text-foreground-600/90">
					{#each currentSeq as key, i (i)}
						{#if i > 0}<span class="text-foreground-300">→</span>{/if}
						<span
							class:text-highlight-600={i === inputKeys.length}
							class:text-foreground-300={i < inputKeys.length}
						>
							{key}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Top Controls: in fullscreen, completely hidden unless hovering at the top edge -->
		<div class="group absolute top-0 inset-x-0 h-16 z-50 pointer-events-none flex items-start justify-between p-4">
			<div
				class="w-full flex items-center justify-between transition-opacity duration-150"
				class:opacity-100={!isFullscreen}
				class:opacity-0={isFullscreen}
				class:group-hover:opacity-100={isFullscreen}
				class:pointer-events-auto={!isFullscreen}
				class:group-hover:pointer-events-auto={isFullscreen}
			>
				<a
					href="{base}/"
					class="border-2 border-foreground-600 bg-background-100/95 px-3 py-1.5 text-base outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
				>
					← back
				</a>

				<div class="flex items-center gap-4 border-2 border-foreground-600 bg-background-100/95 px-4 py-1.5 shadow-sm">
					<span class="text-base text-foreground-400">
						{Math.min(taskIndex + 1, total)}/{total}
					</span>
					<button
						type="button"
						class="text-xs text-foreground-400 underline outline-none hover:text-foreground-600"
						onclick={toggleSegment}
						title="Ctrl+K to swap"
					>
						{segment} (ctrl+k)
					</button>
				</div>

				<button
					type="button"
					class="border-2 border-foreground-600 bg-background-100/95 px-3 py-1.5 text-base outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
					onclick={toggleFullscreen}
				>
					{isFullscreen ? 'exit fullscreen' : 'fullscreen'}
				</button>
			</div>
		</div>

		<!-- Bottom Input Slots Overlay (hidden in fullscreen so bottom cells are never obscured) -->
		{#if !isFullscreen}
			<div class="pointer-events-none absolute bottom-4 inset-x-0 flex justify-center z-50">
				<div class="flex items-center gap-3 border-2 border-foreground-600 bg-background-100/95 px-4 py-1.5 shadow-sm">
					{#each currentSeq as _key, i (i)}
						<div
							class="flex h-9 w-9 items-center justify-center border-2 text-xl font-bold"
							class:border-highlight-600={i < inputKeys.length}
							class:text-highlight-600={i < inputKeys.length}
							class:border-foreground-300={i >= inputKeys.length}
							class:text-foreground-300={i >= inputKeys.length}
						>
							{i < inputKeys.length ? inputKeys[i] : '·'}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Subtle Screen Mistake Flash -->
		{#if mistakeKey > 0}
			{#key mistakeKey}
				<div class="pointer-events-none fixed inset-0 z-50 mistake-flash"></div>
			{/key}
		{/if}
	</div>
{/if}

<style>
	@keyframes mistakeFlash {
		0% {
			background-color: rgba(220, 38, 38, 0.18);
			box-shadow: inset 0 0 0 4px rgba(220, 38, 38, 0.6);
		}
		100% {
			background-color: transparent;
			box-shadow: inset 0 0 0 0 transparent;
		}
	}

	.mistake-flash {
		animation: mistakeFlash 180ms ease-out forwards;
	}
</style>
