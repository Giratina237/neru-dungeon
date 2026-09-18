import { MAX_DEPTH } from './grid';
import type { GridConfig, LessonDef, Sequence } from './types';

// ─── Lesson list (no randomness — used for display) ───────────────────────────

export function getRowPairs(rKeys: string[]): string[][] {
	const n = rKeys.length;
	if (n < 2) return [];
	if (n === 2) return [[rKeys[0], rKeys[1]]];
	if (n === 3)
		return [
			[rKeys[0], rKeys[1]],
			[rKeys[1], rKeys[2]],
		];
	if (n === 4)
		return [
			[rKeys[0], rKeys[1]],
			[rKeys[2], rKeys[3]],
		];
	if (n === 5) {
		return [
			[rKeys[0], rKeys[1]], // first two (keys 1, 2)
			[rKeys[1], rKeys[2]], // 2, 3 letters
			[rKeys[3], rKeys[4]], // 4, 5 letters
		];
	}
	const pairs: string[][] = [];
	if (n % 2 === 0) {
		for (let i = 0; i < n; i += 2) {
			pairs.push([rKeys[i], rKeys[i + 1]]);
		}
	} else {
		pairs.push([rKeys[0], rKeys[1]]);
		pairs.push([rKeys[1], rKeys[2]]);
		for (let i = 3; i < n; i += 2) {
			if (i + 1 < n) {
				pairs.push([rKeys[i], rKeys[i + 1]]);
			}
		}
	}
	return pairs;
}

export function buildLessonList(config: GridConfig): LessonDef[] {
	const lessons: LessonDef[] = [];
	const u = config.keys.toUpperCase();

	const keyAt = (r: number, c: number) => u[r * config.cols + c];
	const rowKeys = (r: number) => Array.from({ length: config.cols }, (_, c) => keyAt(r, c));
	const colKeys = (c: number) => Array.from({ length: config.rows }, (_, r) => keyAt(r, c));
	const rowLabel = (r: number) => {
		if (config.rows === 1) return 'row 1';
		if (r === 0) return 'top row';
		if (r === config.rows - 1) return 'bottom row';
		if (config.rows === 3 && r === 1) return 'middle row';
		return `row ${r + 1}`;
	};

	// Row lessons
	for (let r = 0; r < config.rows; r++) {
		const rKeys = rowKeys(r);
		const group = rowLabel(r);

		const pairs = getRowPairs(rKeys);
		for (let p = 0; p < pairs.length; p++) {
			const pair = pairs[p];
			lessons.push({
				id: `r${r}p${p}`,
				label: pair.join(' '),
				group,
				kind: 'intro',
				keys: pair,
			});
		}

		// Whole row test (when row has 3+ keys, or single row)
		if (rKeys.length > 2 || pairs.length === 0) {
			lessons.push({
				id: `r${r}full`,
				label: `${rowLabel(r)} (all)`,
				group,
				kind: 'row',
				keys: rKeys,
			});
		}
	}

	// Column lessons (one per column, no per-key intro)
	for (let c = 0; c < config.cols; c++) {
		const keys = colKeys(c);
		lessons.push({ id: `c${c}`, label: `column ${c + 1}`, group: 'columns', kind: 'column', keys });
	}

	// Complete grid (after columns, above key history)
	lessons.push({
		id: 'complete',
		label: 'complete grid',
		group: 'grid practice',
		kind: 'grid',
		keys: [...u],
	});

	return lessons;
}

// ─── 21 words from keybr drill image ──────────────────────────────────────────
export const TWO_KEY_PATTERNS: readonly (readonly ('1' | '2')[])[] = [
	// Line 1: ffff jjjj ff jj fff jjj fj fj
	['1', '1', '1', '1'],
	['2', '2', '2', '2'],
	['1', '1'],
	['2', '2'],
	['1', '1', '1'],
	['2', '2', '2'],
	['1', '2'],
	['1', '2'],
	// Line 2: jjf ffj fff jjj ffj jjf fjfj
	['2', '2', '1'],
	['1', '1', '2'],
	['1', '1', '1'],
	['2', '2', '2'],
	['1', '1', '2'],
	['2', '2', '1'],
	['1', '2', '1', '2'],
	// Line 3: fffj jjjf ffjj ff jj ffff
	['1', '1', '1', '2'],
	['2', '2', '2', '1'],
	['1', '1', '2', '2'],
	['1', '1'],
	['2', '2'],
	['1', '1', '1', '1'],
];

/**
 * Expected sequence count for display (no randomness).
 */
export function sequenceCount(lesson: LessonDef): number {
	if (lesson.kind === 'intro') return TWO_KEY_PATTERNS.length; // 21 words
	if (lesson.kind === 'review') return 10; // 5 depth-2 + 5 depth-3
	if (lesson.kind === 'grid') return 2 * Math.max(10, lesson.keys.length);
	if (lesson.kind === 'row' || lesson.kind === 'column') return 20; // 10 depth-2 + 10 depth-3
	return 10;
}

// ─── Session sequences (called fresh per training session) ────────────────────

export function buildSessionSequences(lesson: LessonDef, config?: GridConfig): Sequence[] {
	if (lesson.kind === 'intro') {
		const k1 = lesson.keys[0];
		const k2 = lesson.keys[1] ?? k1;
		return twoKeyDrill(k1, k2);
	}
	if (lesson.kind === 'review') {
		const targetKey = lesson.reviewKey ?? lesson.keys[0];
		const allKeys = config ? config.keys.split('') : lesson.keys;
		return buildReviewSequences(targetKey, allKeys);
	}
	if (lesson.kind === 'grid' || lesson.id === 'complete') {
		return buildCompleteGridSequences([...lesson.keys]);
	}
	// Row or column: 10 depth-2 + 10 depth-3 tests
	return depth2And3Tests([...lesson.keys], 10, 10);
}

/**
 * 2-key drill — 21 words matching the uploaded image exactly.
 */
function twoKeyDrill(k1: string, k2: string): Sequence[] {
	return TWO_KEY_PATTERNS.map((pattern) => pattern.map((code) => (code === '1' ? k1 : k2)));
}

/**
 * Generate N tests of depth 2 followed by M tests of depth 3 from keys,
 * avoiding exact consecutive duplicates.
 */
function depth2And3Tests(keys: string[], countD2: number, countD3: number): Sequence[] {
	const d2 = randomAtDepth(keys, 2, countD2);
	const d3 = randomAtDepth(keys, Math.min(3, MAX_DEPTH), countD3);
	return [...d2, ...d3];
}

/**
 * Review Mode sequences: 5 depth-2 tests and 5 depth-3 tests featuring selectedKey,
 * alternating with random keys and avoiding consecutive identical sequences.
 */
export function buildReviewSequences(selectedKey: string, allKeys: readonly string[]): Sequence[] {
	const sel = selectedKey.toUpperCase();
	const others = allKeys.map((k) => k.toUpperCase()).filter((k) => k !== sel);
	const pickOther = (exclude?: string) => {
		const available = others.filter((k) => k !== exclude);
		const list = available.length > 0 ? available : others;
		return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : sel;
	};

	// 5 depth-2 tests featuring selectedKey
	const d2: Sequence[] = [];
	let lastSeqStr = '';
	for (let i = 0; i < 5; i++) {
		let attempts = 0;
		let candidate: string[] = [];
		while (attempts < 20) {
			const other = pickOther();
			candidate = i % 2 === 0 ? [sel, other] : [other, sel];
			if (candidate.join('') !== lastSeqStr || others.length <= 1) break;
			attempts++;
		}
		lastSeqStr = candidate.join('');
		d2.push(candidate);
	}

	// 5 depth-3 tests featuring selectedKey
	const d3: Sequence[] = [];
	for (let i = 0; i < 5; i++) {
		let attempts = 0;
		let candidate: string[] = [];
		while (attempts < 20) {
			const o1 = pickOther();
			const o2 = pickOther(o1);
			const pos = i % 3;
			if (pos === 0) candidate = [sel, o1, o2];
			else if (pos === 1) candidate = [o1, sel, o2];
			else candidate = [o1, o2, sel];
			if (candidate.join('') !== lastSeqStr || others.length <= 1) break;
			attempts++;
		}
		lastSeqStr = candidate.join('');
		d3.push(candidate);
	}

	return [...d2, ...d3];
}

/**
 * Generates sequences at depth, guaranteeing no back-to-back duplicates.
 */
function randomAtDepth(keys: string[], depth: number, count: number): Sequence[] {
	const pool = allAtDepth(keys, depth);
	if (pool.length === 0) return [];
	if (pool.length === 1) return Array.from({ length: count }, () => [...pool[0]]);

	const result: Sequence[] = [];
	let lastJoined = '';

	while (result.length < count) {
		const shuffled = shuffle(pool);
		for (const seq of shuffled) {
			const joined = seq.join('');
			if (joined !== lastJoined) {
				result.push(seq);
				lastJoined = joined;
				if (result.length === count) break;
			}
		}
	}
	return result;
}

function allAtDepth(keys: string[], depth: number): Sequence[] {
	const result: Sequence[] = [];
	const fill = (curr: string[]) => {
		if (curr.length === depth) {
			result.push([...curr]);
			return;
		}
		for (const k of keys) {
			curr.push(k);
			fill(curr);
			curr.pop();
		}
	};
	fill([]);
	return result;
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/**
 * Complete Grid sequences: tests all keys at least 5 times each
 * (across approaching the quadrant and the answer).
 * Generates N depth-2 tests and N depth-3 tests where N = max(10, keys.length).
 */
export function buildCompleteGridSequences(keys: string[]): Sequence[] {
	const n = Math.max(10, keys.length);
	const d2 = generateCompleteSequencesAtDepth(keys, 2, n);
	const d3 = generateCompleteSequencesAtDepth(keys, Math.min(3, MAX_DEPTH), n);
	return [...d2, ...d3];
}

function generateCompleteSequencesAtDepth(
	keys: string[],
	depth: number,
	count: number,
): Sequence[] {
	if (keys.length === 0) return [];
	if (keys.length === 1) {
		return Array.from({ length: count }, () => Array(depth).fill(keys[0]));
	}

	const pool: string[] = [];
	for (let d = 0; d < depth; d++) {
		pool.push(...keys);
	}
	while (pool.length < count * depth) {
		const needed = count * depth - pool.length;
		if (needed >= keys.length) pool.push(...keys);
		else pool.push(...shuffle(keys).slice(0, needed));
	}
	pool.length = count * depth;

	for (let attempt = 0; attempt < 100; attempt++) {
		const remaining = shuffle(pool);
		const seqs: Sequence[] = [];
		let failed = false;

		for (let i = 0; i < count; i++) {
			const lastStr = i > 0 ? seqs[i - 1]?.join('') : null;

			if (remaining.slice(0, depth).join('') === lastStr) {
				let swapped = false;
				for (let j = depth; j < remaining.length; j++) {
					for (let p = 0; p < depth; p++) {
						if (remaining[j] !== remaining[p]) {
							[remaining[p], remaining[j]] = [remaining[j], remaining[p]];
							if (remaining.slice(0, depth).join('') !== lastStr) {
								swapped = true;
								break;
							}
							[remaining[p], remaining[j]] = [remaining[j], remaining[p]];
						}
					}
					if (swapped) break;
				}
				if (!swapped) {
					for (let k = 0; k < seqs.length - 1; k++) {
						const cand = remaining.slice(0, depth);
						const prevK = k > 0 ? seqs[k - 1]?.join('') : '';
						const nextK = seqs[k + 1]?.join('');
						if (
							cand.join('') !== prevK &&
							cand.join('') !== nextK &&
							seqs[k]?.join('') !== lastStr
						) {
							const temp = seqs[k];
							seqs[k] = cand;
							seqs.push(temp);
							swapped = true;
							break;
						}
					}
					if (!swapped) {
						failed = true;
						break;
					}
				}
			}

			if (seqs.length <= i) {
				seqs.push(remaining.splice(0, depth));
			}
		}

		if (!failed) return seqs;
	}

	const result: Sequence[] = [];
	for (let i = 0; i < count; i++) {
		result.push(pool.slice(i * depth, (i + 1) * depth));
	}
	return result;
}

