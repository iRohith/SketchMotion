import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		const { image } = data;

		if (!image) {
			return json({ error: 'Image is required' }, { status: 400 });
		}

		// Simulate API delay
		await new Promise((r) => setTimeout(r, 1000));

		// "generate-image return the same image that was passed."
		return json({ success: true, image: image });
	} catch (error) {
		console.error('[Demo API] Image generation error:', error);
		return json({ success: false, error: 'Failed to generate image (Demo)' }, { status: 500 });
	}
};
