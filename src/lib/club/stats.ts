export const KEY_HISTORY_STORAGE_KEY = 'neru-dungeon-key-history';
export const LEGACY_KEY_HISTORY_STORAGE_KEY = 'neru-club-key-history';
export const MAX_HISTORY_PER_KEY = 30;

export type KeyAttempt = {
	reactionTimeMs: number;
	correct: boolean;
};

export type KeyHistoryMap = Record<string, KeyAttempt[]>;

export type KeySummary = {
	key: string;
	attempts: number;
	avgReactionMs: number;
	accuracyPct: number;
};

export type SessionResult = {
	totalWords: number;
	totalTimeMs: number;
	avgReactionTimePerWordMs: number;
	accuracyPct: number;
	correctPresses: number;
	misses: number;
};

/**
 * Loads the raw key attempt history from localStorage.
 */
export function loadKeyHistory(): KeyHistoryMap {
	if (typeof window === 'undefined') return {};
	try {
		const raw =
			localStorage.getItem(KEY_HISTORY_STORAGE_KEY) ??
			localStorage.getItem(LEGACY_KEY_HISTORY_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * Appends new key attempts to localStorage, keeping at most 30 per key.
 */
export function saveKeyAttempts(
	attempts: Array<{ key: string; reactionTimeMs: number; correct: boolean }>,
): void {
	if (typeof window === 'undefined' || attempts.length === 0) return;

	const history = loadKeyHistory();

	for (const { key, reactionTimeMs, correct } of attempts) {
		const upper = key.toUpperCase();
		if (!history[upper]) {
			history[upper] = [];
		}
		history[upper].push({
			reactionTimeMs: Math.round(reactionTimeMs),
			correct,
		});
		if (history[upper].length > MAX_HISTORY_PER_KEY) {
			history[upper] = history[upper].slice(-MAX_HISTORY_PER_KEY);
		}
	}

	try {
		localStorage.setItem(KEY_HISTORY_STORAGE_KEY, JSON.stringify(history));
	} catch {
		// Ignore quota errors
	}
}

/**
 * Computes the last-30 summary for given keys (or all recorded keys).
 */
export function getKeySummaries(filterKeys?: readonly string[]): KeySummary[] {
	const history = loadKeyHistory();
	const targetKeys = filterKeys
		? filterKeys.map((k) => k.toUpperCase())
		: Object.keys(history).sort();

	const summaries: KeySummary[] = [];

	for (const key of targetKeys) {
		const attempts = history[key] ?? [];
		if (attempts.length === 0) {
			summaries.push({
				key,
				attempts: 0,
				avgReactionMs: 0,
				accuracyPct: 0,
			});
			continue;
		}

		const totalRt = attempts.reduce((acc, a) => acc + a.reactionTimeMs, 0);
		const correctCount = attempts.filter((a) => a.correct).length;

		summaries.push({
			key,
			attempts: attempts.length,
			avgReactionMs: Math.round(totalRt / attempts.length),
			accuracyPct: Math.round((correctCount / attempts.length) * 100),
		});
	}

	return summaries;
}

/**
 * Clears stored key history.
 */
export function clearKeyHistory(): void {
	if (typeof window === 'undefined') return;
	localStorage.removeItem(KEY_HISTORY_STORAGE_KEY);
}

/**
 * Returns the top N slowest keys sorted by highest average reaction time.
 */
export function getSlowestKeys(keySummaries: readonly KeySummary[], limit = 5): KeySummary[] {
	return [...keySummaries]
		.filter((s) => s.attempts > 0)
		.sort((a, b) => b.avgReactionMs - a.avgReactionMs)
		.slice(0, limit);
}
