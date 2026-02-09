import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ExistingGroup {
	color: string;
	groupId: string;
	strokeIds: string[];
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { existingGroups, groupId, isRetry } = body;

		const allStrokeIds = (existingGroups as ExistingGroup[]).flatMap((g) => g.strokeIds);
		const idsString = allStrokeIds.join(' ').toLowerCase();

		let title = 'Drawing Element';
		let content = 'A hand-drawn element in the sketch.';

		if (idsString.includes('hill')) {
			title = 'Green Hills';
			content = 'A set of rolling green hills that form the landscape background.';
		} else if (idsString.includes('sun')) {
			title = 'Golden Sun';
			content = 'A bright, radiant sun positioned in the sky, providing light to the scene.';
		} else if (idsString.includes('river')) {
			title = 'Blue River';
			content = 'A calm river flowing through the center of the drawing.';
		} else if (idsString.includes('giraffe')) {
			title = 'Tall Giraffe';
			content = 'A graceful giraffe with an orange-spotted coat wandering the plains.';
		} else if (idsString.includes('zebra')) {
			if (isRetry) {
				title = 'Striped Zebra';
				content =
					'Corrected identification: This is a zebra with distinct black and white stripes.';
			} else {
				title = 'A Horse?';
				content = 'This looks like a horse or a similar four-legged animal.';
			}
		}

		// Simulate API delay
		await new Promise((r) => setTimeout(r, 500));

		return json({
			success: true,
			message: 'Demo Analysis complete',
			title,
			content,
			objectId: groupId,
			sessionId: 'demo-session-' + Date.now(),
			retryCount: isRetry ? 1 : 0,
			canRetry: true
		});
	} catch (error) {
		console.error('[Demo API] Error:', error);
		return json({ success: false, error: 'Demo API internal error' }, { status: 500 });
	}
};
