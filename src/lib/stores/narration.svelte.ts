export interface NarrationMessage {
	id: string;
	text: string;
	startTime: number;
	duration: number;
	sound?: 'click' | 'brush' | 'typing';
}

class NarrationStore {
	current = $state<NarrationMessage | null>(null);
	queue = $state<NarrationMessage[]>([]);
	visible = $state(false);
	typedText = $state('');
	isTyping = $state(false);

	private typingInterval: ReturnType<typeof setInterval> | null = null;
	private soundTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();
	private activeAudio: HTMLAudioElement | null = null;

	private clearTyping() {
		if (this.typingInterval) {
			clearInterval(this.typingInterval);
			this.typingInterval = null;
		}
	}

	private clearSounds() {
		this.soundTimeouts.forEach((timeout) => clearTimeout(timeout));
		this.soundTimeouts.clear();
		if (this.activeAudio) {
			this.activeAudio.pause();
			this.activeAudio.currentTime = 0;
			this.activeAudio = null;
		}
	}

	private playSoundInternal(sound: 'click' | 'brush' | 'typing', duration?: number) {
		this.clearSounds();

		const audioMap = {
			click: '/src/lib/assets/matthewvakaliuk73627-mouse-click-290204.mp3',
			brush: '/src/lib/assets/freesound_community-brush-83215.mp3',
			typing: '/src/lib/assets/dragon-studio-keyboard-typing-sound-effect-335503.mp3'
		};

		const audio = new Audio(audioMap[sound]);
		audio.volume = sound === 'click' ? 0.4 : 0.3;
		this.activeAudio = audio;

		audio.play().catch((e) => console.warn('Audio play failed:', e));

		if (duration) {
			const timeout = setTimeout(() => {
				if (this.activeAudio === audio) {
					audio.pause();
					audio.currentTime = 0;
					this.activeAudio = null;
				}
				this.soundTimeouts.delete(timeout);
			}, duration);
			this.soundTimeouts.add(timeout);
		}
	}

	private typeText(message: NarrationMessage) {
		this.clearTyping();

		let charIndex = 0;
		const chars = message.text.split('');
		const typingSpeed = Math.min(50, message.duration / chars.length);

		this.current = message;
		this.visible = true;
		this.typedText = '';
		this.isTyping = true;

		if (message.sound === 'typing') {
			this.playSoundInternal('typing', message.duration);
		}

		this.typingInterval = setInterval(() => {
			if (charIndex < chars.length) {
				this.typedText = this.typedText + chars[charIndex];
				charIndex++;
			} else {
				this.clearTyping();
				this.isTyping = false;
			}
		}, typingSpeed);
	}

	private processQueue() {
		if (this.queue.length === 0) {
			this.visible = false;
			this.current = null;
			return;
		}

		const next = this.queue[0];
		this.queue = this.queue.slice(1);

		this.typeText(next);

		// Wait for typing to complete (duration)
		const timeout = setTimeout(() => {
			// After typing completes, wait 1 second before starting fade-out
			const postMessageWait = setTimeout(() => {
				// Start fade-out by setting visible to false
				this.visible = false;

				// Wait for fade-out animation (300ms) before processing next
				const fadeOutWait = setTimeout(() => {
					this.processQueue();
					this.soundTimeouts.delete(fadeOutWait);
				}, 300);
				this.soundTimeouts.add(fadeOutWait);

				this.soundTimeouts.delete(postMessageWait);
			}, 1000);
			this.soundTimeouts.add(postMessageWait);

			this.soundTimeouts.delete(timeout);
		}, next.duration);
		this.soundTimeouts.add(timeout);
	}

	show(text: string, duration: number = 3000, sound?: 'click' | 'brush' | 'typing') {
		const message: NarrationMessage = {
			id: crypto.randomUUID(),
			text,
			startTime: Date.now(),
			duration,
			sound
		};

		this.queue = [...this.queue, message];

		if (!this.typingInterval && !this.visible) {
			this.processQueue();
		}
	}

	playSound(sound: 'click' | 'brush' | 'typing', duration?: number) {
		this.playSoundInternal(sound, duration);
	}

	clear() {
		this.clearTyping();
		this.clearSounds();
		this.current = null;
		this.queue = [];
		this.visible = false;
		this.typedText = '';
		this.isTyping = false;
	}
}

export const narration = new NarrationStore();
