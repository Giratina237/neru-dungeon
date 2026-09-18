export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'neru-dungeon-theme';
export const LEGACY_THEME_STORAGE_KEY = 'neru-dojo-theme';

export function getInitialTheme(): Theme {
	if (typeof window === 'undefined') return 'light';
	const stored =
		localStorage.getItem(THEME_STORAGE_KEY) ??
		localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
	if (stored === 'dark' || stored === 'light') {
		return stored;
	}
	if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
		return 'dark';
	}
	if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	return 'light';
}

export function applyTheme(next: Theme) {
	if (typeof document === 'undefined') return;
	document.documentElement.classList.toggle('dark', next === 'dark');
	document.documentElement.dataset.theme = next;
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(THEME_STORAGE_KEY, next);
	}
}

export function toggleTheme(currentTheme: Theme): Theme {
	const next: Theme = currentTheme === 'light' ? 'dark' : 'light';
	applyTheme(next);
	return next;
}
