export type GridConfig = {
	rows: number;
	cols: number;
	keys: string; // must be rows*cols chars, uppercase, all unique
};

export type Sequence = readonly string[];
export type Segment = 'guided' | 'recall';

export type LessonKind = 'intro' | 'row' | 'column' | 'grid' | 'review';

export type LessonDef = {
	id: string;
	label: string;
	group: string;
	kind: LessonKind;
	keys: readonly string[];
	reviewKey?: string;
};
