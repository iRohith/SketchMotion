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

		// ============================================================
		// PASS 1: Generate optimized prompt for image transformation
		// ============================================================
		console.log('[API] Pass 1: Generating optimized prompt...');

		const promptGenerationInstruction = `You are an expert prompt engineer for image-to-image generation models.

Analyze this sketch image and the provided context, then generate a SINGLE, highly specific prompt that will transform this rough sketch into a clean, complete sketch drawing.

Context Information (for reference only):
${context || 'User provided sketch.'}

User Instructions:
${prompt || 'None provided.'}

Core Requirements for the Generated Prompt:
1. Preserve EXACT colors from the original sketch (use specific color names/hex if visible)
2. Preserve EXACT composition and layout
3. Render COMPLETE, FULL objects as sketches - not just outlines
   - If the sketch shows an outline of a house, render a FULL sketch of a house
   - If the sketch shows an outline of a car, render a FULL sketch of a car with all details
   - IGNORE any "outline only" mentions in the context unless the user EXPLICITLY requested outlines
4. Keep it as a sketch style (hand-drawn look with clean lines)
5. Smooth wobbly lines into clean sketch strokes
6. DO NOT add photorealistic shading, heavy textures, or complex backgrounds
7. DO NOT change shape, position, or structure of objects
8. Output should look like a polished, complete sketch version of the input

Your Task:
Generate a clear, detailed prompt (2-4 sentences) that instructs an image generation model to transform this sketch into a COMPLETE, FULL sketch drawing following ALL the requirements above.

Respond with ONLY the prompt text, no explanations or additional commentary.`;

		const pass1Contents: PartUnion[] = [
			createPartFromBase64(base64Data, mimeType),
			createPartFromText(promptGenerationInstruction)
		];

		const pass1Response = await client.models.generateContent({
			model: 'gemini-3-flash-preview', // Fast model for text generation
			contents: pass1Contents
		});

		const generatedPrompt = pass1Response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

		if (!generatedPrompt) {
			throw new Error('Failed to generate prompt in Pass 1');
		}

		console.log('[API] Pass 1 complete. Generated prompt:', generatedPrompt);

		// ============================================================
		// PASS 2: Generate clean image using the optimized prompt
		// ============================================================
		console.log('[API] Pass 2: Generating clean image...');

		// Build the prompt array following official specs
		const pass2Prompt = [
			{
				text: generatedPrompt
			},
			{
				inlineData: {
					mimeType: mimeType,
					data: base64Data
				}
			}
		];

		// Call Gemini image generation model
		const pass2Response = await client.models.generateContent({
			model: 'gemini-2.5-flash-image',
			contents: pass2Prompt,
			config: {
				responseModalities: ['IMAGE']
			}
		});

		// Extract generated image
		const generatedPart = pass2Response.candidates?.[0]?.content?.parts?.[0];

		if (!generatedPart || !generatedPart.inlineData) {
			throw new Error('No image generated in Pass 2');
		}

		const generatedImage = `data:${generatedPart.inlineData.mimeType};base64,${generatedPart.inlineData.data}`;

		console.log('[API] Pass 2 complete. Image generated successfully.');

		return json({
			success: true,
			image: generatedImage,
			generatedPrompt: generatedPrompt // Include for debugging/transparency
		});
	} catch (error) {
		console.error('[API] Image generation error:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to generate image';
		return json({ success: false, error: errorMessage }, { status: 500 });
	}
};
