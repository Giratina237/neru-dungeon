export const KEY_HISTORY_STORAGE_KEY = 'neru-dungeon-complete-grid-history';
export const MAX_HISTORY_PER_KEY = 10;

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
	avgReactionTimePerKeyMs: number;
	accuracyPct: number;
	correctPresses: number;
	misses: number;
};

/**
 * Loads the raw key attempt history from localStorage (only complete grid attempts).
 */
export function loadKeyHistory(): KeyHistoryMap {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(KEY_HISTORY_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		for (const k of Object.keys(parsed)) {
			if (Array.isArray(parsed[k]) && parsed[k].length > MAX_HISTORY_PER_KEY) {
				parsed[k] = parsed[k].slice(-MAX_HISTORY_PER_KEY);
			}
		}
		return parsed;
	} catch {
		return {};
	}
}

/**
 * Appends new key attempts to localStorage, keeping at most MAX_HISTORY_PER_KEY per key.
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
 * Computes the summary of the last 10 presses for given keys (or all recorded keys).
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
 * Computes KeySummary list directly from an array of session key attempts
 * (showing stats for the test alone).
 */
export function computeSessionKeySummaries(
	attempts: readonly { key: string; reactionTimeMs: number; correct: boolean }[],
	allKeys?: readonly string[],
): KeySummary[] {
	const keyMap: Record<string, { totalRt: number; correct: number; count: number }> = {};

	for (const a of attempts) {
		const upper = a.key.toUpperCase();
		if (!keyMap[upper]) {
			keyMap[upper] = { totalRt: 0, correct: 0, count: 0 };
		}
		keyMap[upper].totalRt += a.reactionTimeMs;
		keyMap[upper].count += 1;
		if (a.correct) {
			keyMap[upper].correct += 1;
		}
	}

	const keysToInclude = allKeys
		? allKeys.map((k) => k.toUpperCase())
		: Object.keys(keyMap).sort();

	return keysToInclude.map((key) => {
		const stat = keyMap[key];
		if (!stat || stat.count === 0) {
			return {
				key,
				attempts: 0,
				avgReactionMs: 0,
				accuracyPct: 0,
			};
		}
		return {
			key,
			attempts: stat.count,
			avgReactionMs: Math.round(stat.totalRt / stat.count),
			accuracyPct: Math.round((stat.correct / stat.count) * 100),
		};
	});
}

/**
 * Clears stored key history.
 */
export function clearKeyHistory(): void {
	if (typeof window === 'undefined') return;
	localStorage.removeItem(KEY_HISTORY_STORAGE_KEY);
	localStorage.removeItem('neru-dungeon-key-history');
	localStorage.removeItem('neru-club-key-history');
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
