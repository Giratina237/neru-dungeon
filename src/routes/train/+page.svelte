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

	let segment = $state<Segment>('guided');
	let taskIndex = $state(0);
	let inputKeys = $state<string[]>([]);
	let done = $state(false);
	let reflashKey = $state(0);
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
		} else {
			const list = buildLessonList(config);
			const found = list.find((l) => l.id === lessonId);
			if (!found) { goto(`${base}/`); return; }

			lesson = found;
			sequences = buildSessionSequences(found, config);
			ready = true;
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
			// Check if key target location is identical to previous location
			const prevInput = [...inputKeys];
			const nextInput = [...inputKeys, key];

			// Only detect same position when transitioning inside sequence or double-word test
			if (prevInput.length > 0) {
				const prevRegion = computeRegion(
					config,
					isDoubleWordTest ? [prevInput[prevInput.length - 1]] : prevInput,
				);
				const nextRegion = computeRegion(
					config,
					isDoubleWordTest ? [key] : nextInput,
				);
				if (
					Math.abs(prevRegion.top - nextRegion.top) < 0.001 &&
					Math.abs(prevRegion.left - nextRegion.left) < 0.001 &&
					Math.abs(prevRegion.width - nextRegion.width) < 0.001 &&
					Math.abs(prevRegion.height - nextRegion.height) < 0.001
				) {
					reflashKey += 1;
				}
			}

			keyAttempts.push({ key, reactionTimeMs, correct: true });
			correctPresses++;
			inputKeys = nextInput;
			keyStartTime = now;

			if (inputKeys.length === currentSeq.length) {
				wordDurations.push(now - taskStartTime);
				const nextTask = taskIndex + 1;
				if (nextTask >= total) {
					finishSession();
				} else {
					taskIndex = nextTask;
					inputKeys = [];
					taskStartTime = performance.now();
					keyStartTime = taskStartTime;
				}
			}
		} else {
			keyAttempts.push({ key: expected, reactionTimeMs, correct: false });
			missPresses++;
			inputKeys = [];
			taskStartTime = performance.now();
			keyStartTime = taskStartTime;
		}
	}

	function finishSession() {
		done = true;

		// Save key attempts to persistent rolling window
		saveKeyAttempts(keyAttempts);
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
		done = false;
		correctPresses = 0;
		missPresses = 0;
		wordDurations = [];
		keyAttempts = [];
		sessionResult = null;

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

		<!-- Top HUD Overlay -->
		<div class="pointer-events-none absolute top-4 inset-x-4 flex items-center justify-between z-50">
			<a
				href="{base}/"
				class="pointer-events-auto border-2 border-foreground-600 bg-background-100/95 px-3 py-1.5 text-base outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
			>
				← back
			</a>

			<div class="pointer-events-auto flex items-center gap-4 border-2 border-foreground-600 bg-background-100/95 px-4 py-1.5 shadow-sm">
				{#if segment === 'guided'}
					<div class="flex items-center gap-3 text-2xl font-bold">
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
					<span class="text-foreground-300">|</span>
				{/if}
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
				class="pointer-events-auto border-2 border-foreground-600 bg-background-100/95 px-3 py-1.5 text-base outline-none hover:bg-foreground-600 hover:text-background-100 focus-visible:border-highlight-600"
				onclick={toggleFullscreen}
			>
				{isFullscreen ? 'exit fullscreen' : 'fullscreen'}
			</button>
		</div>

		<!-- Bottom Input Slots Overlay -->
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
	</div>
{/if}
