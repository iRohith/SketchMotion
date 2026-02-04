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

export interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
}

export interface Stroke {
	id: string;
	points: StrokePoint[];
	color: string;
	size: number;
	transform?: Transform;
	bounding?: BoundingBox;
	corners?: boolean[];
}

export interface Transform {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}
