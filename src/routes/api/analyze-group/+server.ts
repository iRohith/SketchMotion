import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	GoogleGenAI,
	ThinkingLevel,
	type PartUnion,
	createPartFromBase64,
	createPartFromText
} from '@google/genai';
import { GOOGLE_API_KEY } from '$env/static/private';
import {
	type AnalysisSession,
	type FeedbackEntry,
	createSession,
	getSessionKey,
	SESSION_TTL
} from '../analyze/session';

// Existing group info from client
interface ExistingGroup {
	color: string;
	groupId: string;
	strokeIds: string[];
}

// AI-suggested group merge
interface SuggestedMerge {
	name: string;
	reason: string;
	groupIds: string[];
	confidence: number;
}

// AI-suggested group split
interface SuggestedSplit {
	groupId: string;
	reason: string;
	confidence: number;
}

// Map model setting to Gemini model
const getModelConfig = (model: 'flash' | 'pro' | 'pro-high') => {
	switch (model) {
		case 'flash':
			return { name: 'gemini-3-flash-preview', thinking: ThinkingLevel.LOW };
		case 'pro':
			return { name: 'gemini-3-pro-preview', thinking: ThinkingLevel.LOW };
		case 'pro-high':
			return { name: 'gemini-3-pro-preview', thinking: ThinkingLevel.HIGH };
	}
};

// Build context from feedback history
function buildFeedbackContext(feedbackHistory: FeedbackEntry[]): string {
	if (feedbackHistory.length === 0) return '';

	let context = '## Previous Feedback:\n';
	for (const f of feedbackHistory) {
		if (f.wasAccepted) {
			context += `✓ Confirmed: "${f.title}"`;
			if (f.userText) context += ` (User note: "${f.userText}")`;
			context += '\n';
		} else {
			context += `✗ Rejected: "${f.title}" - This is NOT the correct identification\n`;
		}
	}
	return context + '\n';
}

// Build prompt for two-pass intelligent analysis
function buildGroupingPrompt(
	existingGroups: ExistingGroup[],
	feedbackHistory: FeedbackEntry[],
	isRetry: boolean,
	retryCount: number
): string {
	const groupList = existingGroups
		.map(
			(g, i) =>
				`  - Group ${i + 1} (${g.color} outline): ID="${g.groupId}", ${g.strokeIds.length} stroke(s)`
		)
		.join('\n');

	const feedbackContext = buildFeedbackContext(feedbackHistory);

	let retryContext = '';
	if (isRetry) {
		retryContext = `
## ⚠️ RETRY NOTICE (Attempt ${retryCount + 1}/3)
Your previous analysis was REJECTED. Think differently!
- Consider completely different interpretations
- The previous identification was WRONG

`;
	}

	return `You are analyzing a SINGLE element in a hand-drawn sketch.

## 📷 IMAGE 1 (Intent Image) - YOUR ONLY FOCUS:
- **BRIGHT strokes** = The SINGLE element you must identify
- **DIM strokes** (faded) = IGNORE completely, these are other objects
- Describe ONLY what the bright strokes represent

## 📷 IMAGE 2 (Context Image) - Group Information:
- Colored outlines show current groupings
- Use ONLY to see which group the bright strokes belong to

${feedbackContext}${retryContext}## Current Groups:
${groupList || '  No groups detected yet'}

## Your Task:
Identify what the BRIGHT strokes represent. Provide a short title and description.

## ⚠️ STRICT RULES - READ CAREFULLY:
1. Focus ONLY on the bright strokes. Ignore all dim/faded strokes.
2. Do NOT suggest merges unless you are EXTREMELY confident (0.85+) that groups are parts of the EXACT SAME OBJECT (e.g., wheels of the SAME car)
3. NEVER merge different objects just because they are nearby or related conceptually (a tree near a house are TWO objects, not one)
4. When in doubt, suggest NO merges - empty arrays are fine
5. Splits: Only suggest if a group clearly contains unrelated strokes

## Response Format (JSON only):
{
  "title": "Short name (3-5 words)",
  "description": "What does this element represent? (1-2 sentences)",
  "suggestedMerges": [],
  "suggestedSplits": []
}

⚠️ MERGE EXAMPLES:
- ✅ Correct merge: Head + body of SAME stick figure → merge
- ✅ Correct merge: All 4 wheels of SAME car → merge with car body
- ❌ WRONG merge: Tree + House → NEVER merge, they are different objects
- ❌ WRONG merge: Sun + Cloud → NEVER merge, they are different objects
- ❌ WRONG merge: Two separate trees → NEVER merge, they are different instances

Only respond with valid JSON, no extra text.`;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	// Rate limiting via Cloudflare binding
	if (platform?.env?.ANALYSIS_LIMITER) {
		const clientId = request.headers.get('x-client-id');
		if (!clientId) {
			return json({ success: false, error: 'Missing client ID' }, { status: 400 });
		}

		const { success } = await platform.env.ANALYSIS_LIMITER.limit({ key: clientId });
		if (!success) {
			return json(
				{
					success: false,
					error: 'Too many requests',
					retryAfter: 10
				},
				{ status: 429 }
			);
		}
	}

	try {
		const clientId = request.headers.get('x-client-id') || 'anonymous';
		const data = (await request.json()) as {
			intentImage: string;
			contextImage: string;
			groupId: string;
			existingGroups?: ExistingGroup[];
			sessionId?: string;
			feedback?: 'yes' | 'no' | 'other';
			feedbackText?: string;
			previousTitle?: string;
			isRetry?: boolean;
		};

		const {
			intentImage,
			contextImage,
			groupId,
			existingGroups = [],
			sessionId,
			feedback,
			feedbackText,
			previousTitle,
			isRetry = false
		} = data;

		// Logging: Request received
		console.log(
			`[API] Analysis request: client=${clientId}, group=${groupId}, isRetry=${isRetry}, feedback=${feedback || 'none'}, existingGroups=${existingGroups.length}`
		);

		if (!intentImage || !contextImage) {
			console.error('[API] Missing images in request');
			return json({ error: 'Both intentImage and contextImage are required' }, { status: 400 });
		}

		// Log image sizes
		console.log(
			`[API] Image sizes: intent=${Math.round(intentImage.length / 1024)}KB, context=${Math.round(contextImage.length / 1024)}KB`
		);

		// Session management
		let session: AnalysisSession;
		const currentSessionId = sessionId || crypto.randomUUID();
		const kv = platform?.env?.ANALYSIS_SESSIONS;

		if (kv && sessionId) {
			// Try to load existing session
			const savedSession = await kv.get(getSessionKey(sessionId), 'json');
			if (savedSession) {
				session = savedSession as AnalysisSession;
			} else {
				session = createSession(clientId, groupId);
			}
		} else {
			session = createSession(clientId, groupId);
		}

		// Handle feedback if provided
		if (feedback && previousTitle) {
			const feedbackEntry: FeedbackEntry = {
				groupId,
				wasAccepted: feedback === 'yes' || feedback === 'other',
				title: previousTitle,
				userText: feedback === 'other' ? feedbackText : undefined,
				timestamp: Date.now()
			};
			session.feedbackHistory.push(feedbackEntry);

			// Increment retry count for "no" feedback
			if (feedback === 'no') {
				session.retryCount++;
			}
		}

		// Check if max retries reached
		if (session.retryCount >= 3) {
			// Save session and return max retries response
			if (kv) {
				await kv.put(getSessionKey(currentSessionId), JSON.stringify(session), {
					expirationTtl: SESSION_TTL
				});
			}

			return json({
				success: false,
				error: 'Max retries reached',
				sessionId: currentSessionId,
				retryCount: session.retryCount,
				canRetry: false,
				message: 'Maximum analysis attempts reached. You can add custom feedback.'
			});
		}

		// Initialize Google Gemini AI client
		const client = new GoogleGenAI({
			vertexai: true,
			apiKey: GOOGLE_API_KEY
		});

		// Use flash model by default for quick analysis
		const modelConfig = getModelConfig('flash');

		// Build intelligent grouping prompt with feedback history
		const prompt = buildGroupingPrompt(
			existingGroups,
			session.feedbackHistory,
			isRetry,
			session.retryCount
		);

		// Extract base64 data from both images
		const intentBase64 = intentImage.split(',')[1] || intentImage;
		const contextBase64 = contextImage.split(',')[1] || contextImage;
		const mimeType = intentImage.includes('image/jpeg') ? 'image/jpeg' : 'image/png';

		// Build contents array with both images for two-pass analysis
		// Order: Intent Image (what), Context Image (relationships), then prompt
		const contents: PartUnion[] = [
			createPartFromBase64(intentBase64, mimeType),
			createPartFromBase64(contextBase64, mimeType),
			createPartFromText(prompt)
		];

		// Log before Gemini call
		console.log(
			`[API] Calling Gemini: model=${modelConfig.name}, sessionId=${currentSessionId}, retryCount=${session.retryCount}`
		);

		// Call Gemini
		const result = await client.models.generateContent({
			model: modelConfig.name,
			contents,
			config: {
				thinkingConfig: { thinkingLevel: modelConfig.thinking }
			}
		});

		console.log('[API] Gemini response received');

		const rawAnalysis = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

		if (!rawAnalysis) {
			throw new Error('No response from Gemini');
		}

		// Try to parse as JSON response
		let title = 'Visual Analysis';
		let content = rawAnalysis;
		let suggestedMerges: SuggestedMerge[] = [];
		let suggestedSplits: SuggestedSplit[] = [];

		try {
			// Extract JSON from response (handle markdown code blocks)
			let jsonStr = rawAnalysis;
			const jsonMatch = rawAnalysis.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				jsonStr = jsonMatch[1].trim();
			}

			const parsed = JSON.parse(jsonStr) as {
				title?: string;
				description?: string;
				suggestedMerges?: SuggestedMerge[];
				suggestedSplits?: SuggestedSplit[];
				// Support legacy format
				suggestedGroups?: {
					name: string;
					description: string;
					groupIds: string[];
					confidence: number;
				}[];
			};

			if (parsed.title) title = parsed.title;
			if (parsed.description) content = parsed.description;
			if (parsed.suggestedMerges) suggestedMerges = parsed.suggestedMerges;
			if (parsed.suggestedSplits) suggestedSplits = parsed.suggestedSplits;
			// Handle legacy suggestedGroups format
			if (parsed.suggestedGroups && !parsed.suggestedMerges) {
				suggestedMerges = parsed.suggestedGroups.map((g) => ({
					name: g.name,
					reason: g.description,
					groupIds: g.groupIds,
					confidence: g.confidence
				}));
			}
		} catch {
			// Fallback to regex parsing if JSON fails
			const titleMatch = rawAnalysis.match(/Title:\s*(.+?)(?:\n|$)/i);
			const descMatch = rawAnalysis.match(/Description:\s*(.+?)(?:\n\n|$)/is);

			if (titleMatch && descMatch) {
				title = titleMatch[1].trim();
				content = descMatch[1].trim();
			} else {
				const lines = rawAnalysis.split('\n').filter((l) => l.trim());
				if (lines.length > 0) {
					title = lines[0]
						.replace(/^(Title:|#)\s*/i, '')
						.trim()
						.slice(0, 50);
					content = lines.slice(1).join(' ').trim() || lines[0];
				}
			}
		}

		// Add this analysis to session context
		session.context.push({
			role: 'model',
			text: `Title: ${title}\nDescription: ${content}`,
			timestamp: Date.now()
		});

		// Save session to KV
		if (kv) {
			await kv.put(getSessionKey(currentSessionId), JSON.stringify(session), {
				expirationTtl: SESSION_TTL
			});
		}

		// Log success
		console.log(
			`[API] Success: title="${title}", merges=${suggestedMerges.length}, splits=${suggestedSplits.length}`
		);

		return json({
			success: true,
			message: 'Analysis complete',
			title,
			content,
			objectId: groupId,
			suggestedMerges,
			suggestedSplits,
			// Legacy compatibility
			suggestedGroups: suggestedMerges.map((m) => ({
				name: m.name,
				description: m.reason,
				groupIds: m.groupIds,
				confidence: m.confidence
			})),
			sessionId: currentSessionId,
			retryCount: session.retryCount,
			canRetry: session.retryCount < 3
		});
	} catch (error) {
		const errorDetail = error instanceof Error ? error.message : String(error);
		console.error(`[API] Analysis error: ${errorDetail}`);

		let errorMessage = 'Analysis failed';

		if (error instanceof Error) {
			if (error.message.includes('quota')) {
				errorMessage = 'API quota exceeded. Please try again later.';
			} else if (error.message.includes('rate limit')) {
				errorMessage = 'Rate limit exceeded. Please wait 30 seconds.';
			} else if (error.message.includes('invalid model')) {
				errorMessage = 'Invalid model configuration. Please check settings.';
			} else if (error.message.includes('API key')) {
				errorMessage = 'Invalid API key. Please check configuration.';
			} else if (error.message.includes('JSON')) {
				errorMessage = 'Failed to parse AI response. Please try again.';
			} else {
				errorMessage = `Analysis error: ${error.message}`;
			}
		}

		console.error(`[API] Returning error: ${errorMessage}`);
		return json({ success: false, error: errorMessage }, { status: 500 });
	}
};
