/**
 * Processes an image URL to remove white background (alpha erasing)
 * ensuring only foreground pixels remain.
 * Returns a Promise that resolves to a data URL string.
 */
export function removeWhiteBackground(imageUrl: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'Anonymous';
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Canvas context failure'));
				return;
			}
			ctx.drawImage(img, 0, 0);
			const imageData = ctx.getImageData(0, 0, img.width, img.height);
			const data = imageData.data;

			// Threshold for white detection (0-255)
			const threshold = 240;

			for (let i = 0; i < data.length; i += 4) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				// If r, g, b are all sufficiently high (close to white)
				if (r > threshold && g > threshold && b > threshold) {
					data[i + 3] = 0; // Set Alpha to 0 (transparent)
				}
			}

			ctx.putImageData(imageData, 0, 0);
			resolve(canvas.toDataURL());
		};
		img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
		img.src = imageUrl;
	});
}
