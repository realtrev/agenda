import type { RenderItem } from './workspace';
import { focusEditorById } from './editors';

/**
 * Moves focus based on the current RenderView order
 *
 * This will prefer a programmatic focus function registered by the BlockElement Svelte
 * component (via the editors registry). If no editor is registered or focusing fails,
 * it falls back to the legacy DOM-based focusing behavior.
 */
export function moveFocus(direction: 'up' | 'down', currentList: RenderItem[], index: number) {
	let newIndex: number;
	if (direction === 'up') {
		newIndex = Math.max(1, index - 1); // Move up but not below 1
	} else {
		newIndex = Math.min(currentList.length - 1, index + 1); // Move down but not beyond the list
	}

	if (newIndex === index) return;

	// select the next item
	const newItem = currentList[newIndex];

	// Prefer programmatic editor focus if available. focusEditorById returns a Promise<boolean>
	focusEditorById(newItem.id, { at: direction === 'up' ? 'end' : 'start' })
		.then((focused) => {
			if (focused) return;

			// Fallback to DOM-based focusing
			const element = document.querySelector<HTMLElement>(`[data-id='${newItem.id}']`);
			if (!element) return;
			element.focus();

			if (direction === 'up') {
				const range = document.createRange();
				range.selectNodeContents(element);
				range.collapse(false);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			} else {
				const range = document.createRange();
				range.selectNodeContents(element);
				range.collapse(true);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			}
		})
		.catch(() => {
			// On errors, fallback to DOM focusing as well
			const element = document.querySelector<HTMLElement>(`[data-id='${newItem.id}']`);
			if (!element) return;
			element.focus();

			if (direction === 'up') {
				const range = document.createRange();
				range.selectNodeContents(element);
				range.collapse(false);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			} else {
				const range = document.createRange();
				range.selectNodeContents(element);
				range.collapse(true);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			}
		});
}
