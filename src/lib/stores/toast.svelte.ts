// Toast notification store
export interface Toast {
	id: string;
	type: 'error' | 'success' | 'info' | 'warning';
	message: string;
	duration?: number; // milliseconds, undefined = persistent
}

class ToastState {
	toasts = $state<Toast[]>([]);

	show(type: Toast['type'], message: string, duration: number = 5000) {
		const id = crypto.randomUUID();
		const toast: Toast = { id, type, message, duration };

		this.toasts = [...this.toasts, toast];

		if (duration) {
			setTimeout(() => {
				this.dismiss(id);
			}, duration);
		}

		return id;
	}

	error(message: string, duration?: number) {
		return this.show('error', message, duration);
	}

	success(message: string, duration?: number) {
		return this.show('success', message, duration);
	}

	info(message: string, duration?: number) {
		return this.show('info', message, duration);
	}

	warning(message: string, duration?: number) {
		return this.show('warning', message, duration);
	}

	dismiss(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	clear() {
		this.toasts = [];
	}
}

export const toastState = new ToastState();
