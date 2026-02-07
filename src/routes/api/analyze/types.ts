import { z } from 'zod';

// Existing group information
export const ExistingGroupSchema = z.object({
	id: z.string(),
	strokeIds: z.array(z.string()),
	color: z.string(), // Outline color in the image
	bounds: z.object({
		minX: z.number(),
		minY: z.number(),
		maxX: z.number(),
		maxY: z.number()
	})
});

export type ExistingGroup = z.infer<typeof ExistingGroupSchema>;

// Request schema
export const AnalyzeRequestSchema = z.object({
	objectImage: z.string(), // base64 data URL
	canvasImage: z.string().optional(), // base64 data URL
	drawingVideo: z.string().optional(), // base64 data URL
	existingGroups: z.array(ExistingGroupSchema).default([]), // NEW: Group information
	settings: z.object({
		model: z.enum(['flash', 'pro', 'pro-high']).default('flash'),
		enableHints: z.boolean().default(true)
	}),
	previousContext: z.object({
		userFeedbacks: z
			.array(
				z.object({
					question: z.string(),
					answer: z.string()
				})
			)
			.default([])
	}),
	previousDescription: z.string().optional()
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

// AI-suggested group
export interface SuggestedGroup {
	name: string; // e.g., "Flock of Birds"
	description: string; // Why these should be grouped
	groupIds: string[]; // IDs of existing groups to merge
	confidence: number; // 0-1, how confident the AI is
}

// Response types
export interface AnalyzeResponse {
	rawAnalysis?: string;
	suggestedGroups?: SuggestedGroup[]; // NEW: AI-suggested groups
	error?: string;
}

// Model configuration
export interface ModelConfig {
	name: string;
	thinking: number; // ThinkingLevel enum value
}
