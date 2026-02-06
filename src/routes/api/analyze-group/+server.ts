import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

let lastRequestTime = 0;
const THROTTLE_MS = 5000;

export const POST: RequestHandler = async ({ request }) => {
	const now = Date.now();
	if (now - lastRequestTime < THROTTLE_MS) {
		return json(
			{
				success: false,
				error: 'Too many requests',
				retryAfter: Math.ceil((THROTTLE_MS - (now - lastRequestTime)) / 1000)
			},
			{ status: 429 }
		);
	}
	lastRequestTime = now;

	try {
		const data = (await request.json()) as { image: string; groupId: string; timestamp: number };
		const { image, groupId, timestamp } = data;

		if (!image) {
			return json({ error: 'No image provided' }, { status: 400 });
		}

		// Mock AI response
		const responseData = {
			success: true,
			message: 'Analysis received',
			title: 'Visual Group Detected',
			content: `Group ${groupId.slice(0, 8)} successfully analyzed at ${new Date(timestamp).toLocaleTimeString()}. Waiting for detailed interpretation.`,
			objectId: groupId
		};

		return json(responseData);
	} catch (e) {
		console.error('Error processing analysis request:', e);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
