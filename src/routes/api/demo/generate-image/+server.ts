import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync } from 'fs';
import { join } from 'path';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		const { image, context } = data;

		if (!image) {
			return json({ error: 'Image is required' }, { status: 400 });
		}

		// Simulate API delay
		await new Promise((r) => setTimeout(r, 1000));

		let resultImage = image;

		// Mock responses based on context keywords
		const ctxLower = (context || '').toLowerCase();

		if (ctxLower.includes('sun')) {
			try {
				const buffer = readFileSync(join(process.cwd(), 'src/lib/assets/sun.png'));
				resultImage = `data:image/png;base64,${buffer.toString('base64')}`;
			} catch (e) {
				console.error('[Demo API] Failed to load sun asset', e);
			}
		} else if (ctxLower.includes('giraffe') || ctxLower.includes('safari')) {
			try {
				const buffer = readFileSync(join(process.cwd(), 'src/lib/assets/giraffe.png'));
				resultImage = `data:image/png;base64,${buffer.toString('base64')}`;
			} catch (e) {
				console.error('[Demo API] Failed to load giraffe asset', e);
			}
		}

		return json({ success: true, image: resultImage });
	} catch (error) {
		console.error('[Demo API] Image generation error:', error);
		return json({ success: false, error: 'Failed to generate image (Demo)' }, { status: 500 });
	}
};
