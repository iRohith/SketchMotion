// Session state stored in Cloudflare KV
export interface AnalysisSession {
	clientId: string;
	groupId: string;
	startedAt: number;
	context: ChatMessage[]; // Previous messages for continuation
	retryCount: number; // 0-3
	feedbackHistory: FeedbackEntry[];
}

export interface ChatMessage {
	role: 'user' | 'model';
	imageRef?: string; // Reference ID instead of full base64
	text: string;
	timestamp: number;
}

export interface FeedbackEntry {
	groupId: string;
	wasAccepted: boolean; // true for yes/other, false for no
	title: string;
	userText?: string; // "other" feedback text
	timestamp: number;
}

// Helper to create new session
export function createSession(clientId: string, groupId: string): AnalysisSession {
	return {
		clientId,
		groupId,
		startedAt: Date.now(),
		context: [],
		retryCount: 0,
		feedbackHistory: []
	};
}

// KV key helpers
export const SESSION_TTL = 3600; // 1 hour in seconds

export function getSessionKey(sessionId: string): string {
	return `session:${sessionId}`;
}
