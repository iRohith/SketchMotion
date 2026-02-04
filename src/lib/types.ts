export enum Layer {
	BACKGROUND = 0,
	START = 1,
	END = 2,
	FINAL = 3
}

export enum PipelineState {
	RECORDING = 0,
	ANALYZING = 1,
	PROMPTING = 2,
	GENERATING = 3,
	COMPLETE = 4,
	ERROR = 99
}

export interface Point {
	x: number;
	y: number;
}

export interface StrokePoint extends Point {
	t: number;
}

export interface Stroke {
	points: StrokePoint[];
	color: string;
	width: number;
}
