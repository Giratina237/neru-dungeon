import type { GridConfig } from './types';

export const MAX_DEPTH = 3;

export const DEFAULT_CONFIG: GridConfig = {
	rows: 2,
	cols: 1,
	keys: 'SJ',
};

export const CONFIG_STORAGE_KEY = 'neru-dungeon-config';
export const LEGACY_CONFIG_STORAGE_KEY = 'neru-club-config';
export const MODE_STORAGE_KEY = 'neru-dungeon-mode';

export type RegionPercent = {
	top: number;
	height: number;
	left: number;
	width: number;
};

/**
 * Returns null if valid, or an error string describing why the config is invalid.
 */
export function validateConfig(config: GridConfig): string | null {
	const needed = config.rows * config.cols;
	const upper = config.keys.toUpperCase();
	if (upper.length !== needed) return `need ${needed} keys, got ${upper.length}`;
	if (new Set(upper).size !== needed) return 'duplicate keys';
	return null;
}

/**
 * Computes the 2D region (as % of container) for a given key sequence.
 * Empty sequence returns the full area {top:0, height:100, left:0, width:100}.
 */
export function computeRegion(config: GridConfig, sequence: readonly string[]): RegionPercent {
	let top = 0,
		bottom = 100,
		left = 0,
		right = 100;
	const upper = config.keys.toUpperCase();

	for (const k of sequence) {
		const idx = upper.indexOf(k.toUpperCase());
		if (idx < 0) break;
		const row = Math.floor(idx / config.cols);
		const col = idx % config.cols;
		[top, bottom] = divideAxis(top, bottom, row, config.rows);
		[left, right] = divideAxis(left, right, col, config.cols);
	}

	return { top, height: bottom - top, left, width: right - left };
}

function divideAxis(start: number, end: number, index: number, count: number): [number, number] {
	const size = (end - start) / count;
	const s = start + index * size;
	return [s, s + size];
}
