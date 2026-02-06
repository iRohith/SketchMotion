// Demo Framework - Main Entry Point
//
// This module provides a JSON-driven demo system for programmatically
// executing actions like drawing strokes, clicking buttons, and triggering UI.
//
// Usage:
//   import { registerAllActions } from '$lib/demo';
//   import { runScenario } from '$lib/demo';
//
//   // At app startup
//   registerAllActions();
//
//   // To run a demo
//   await runScenario({
//     name: 'Quick Demo',
//     actions: [
//       { action: 'show' },
//       { action: 'setBrushColor', params: { color: '#ff6b6b' } },
//       { action: 'drawStroke', params: { path: [...] } },
//       { action: 'hide' }
//     ]
//   });

// Core exports
export {
	registerAction,
	registerActions,
	runAction,
	runActions,
	hasAction,
	getActionNames
} from './registry';
export {
	runScenario,
	pauseScenario,
	resumeScenario,
	stopScenario,
	stepScenario,
	isRunning,
	isPaused,
	getCurrentScenario,
	getCurrentIndex,
	isCursorVisible,
	demoRunnerState,
	stopDemo
} from '$lib/stores/demoRunner.svelte';

// Types
export type {
	DemoAction,
	DemoScenario,
	ActionHandler,
	DrawStrokeParams,
	DelayParams,
	MoveToParams,
	SetColorParams,
	SetSizeParams,
	SetModeParams,
	SetLayerParams,
	HoverResponseParams,
	ShowHoverParams
} from './types';

// Action registration
export {
	registerAllActions,
	cursorActions,
	toolbarActions,
	canvasActions,
	analysisActions
} from './actions';
