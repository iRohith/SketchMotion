import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	GoogleGenAI,
	type PartUnion,
	createPartFromBase64,
	createPartFromText
} from '@google/genai';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, platform }) => {
	// Rate limiting via Cloudflare binding (optional check)
	if (platform?.env?.ANALYSIS_LIMITER) {
		const clientId = request.headers.get('x-client-id');
		if (clientId) {
			const { success } = await platform.env.ANALYSIS_LIMITER.limit({ key: clientId });
			if (!success) {
				return json(
					{ success: false, error: 'Too many requests', retryAfter: 10 },
					{ status: 429 }
				);
			}
		}
	}

	try {
		const data = (await request.json()) as {
			image: string; // Base64 or URL
			prompt?: string;
			context?: string;
		};

		const { image, prompt, context } = data;

		if (!image) {
			return json({ error: 'Image is required' }, { status: 400 });
		}

		// Initialize Google Gemini AI client
		const client = new GoogleGenAI({
			vertexai: true,
			apiKey: env.GOOGLE_API_KEY
		});

		const base64Data = image.split(',')[1] || image;
		const mimeType = image.includes('image/png') ? 'image/png' : 'image/jpeg';

		const textPrompt = `Turn this rough sketch into a clean, professional vector-style drawing.
		
		Context & Requirements:
		${context || 'User provided sketch.'}
		${prompt || ''}
		
		Instructions:
		1. Strictly preserve the exact colors and composition of the original sketch.
		2. Use the "Stroke Colors" and "Stroke Size" listed in the context given above.
		3. Smooth out wobbly lines (autocorrect) but do NOT change the shape or position of objects.
		4. Do not add shading, texture, or background details.
		5. The output should look like a polished version of the user's exact input.
		`;

		const contents: PartUnion[] = [
			createPartFromText(textPrompt),
			createPartFromBase64(base64Data, mimeType)
		];

		console.log('[API] Generating image with gemini-2.5-flash-image...');

		// Using the user-specified model
		// Call Gemini with image generation configuration
		const response = await client.models.generateContent({
			// model: 'gemini-3-pro-image-preview',
			// model: 'gemini-2.5-flash-image',
			model: 'imagen-4.0-fast-generate-001',
			contents,
			config: {
				responseModalities: ['IMAGE']
			}
		});

		// The response format for image generation in the new SDK:
		// result.candidates[0].content.parts[0].inlineData

		const generatedPart = response.candidates?.[0]?.content?.parts?.[0];

		if (!generatedPart || !generatedPart.inlineData) {
			throw new Error('No image generated');
		}

		const generatedImage = `data:${generatedPart.inlineData.mimeType};base64,${generatedPart.inlineData.data}`;

		return json({ success: true, image: generatedImage });
	} catch (error) {
		console.error('[API] Image generation error:', error);
		return json({ success: false, error: 'Failed to generate image' }, { status: 500 });
	}
};
