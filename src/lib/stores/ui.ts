import type { RenderItem } from './workspace';

/**
 * Moves focus based on the current RenderView order
 */
export function moveFocus(direction: 'up' | 'down', currentList: RenderItem[], index: number) {
	let newIndex: number;
	if (direction === 'up') {
		newIndex = Math.max(1, index - 1); // Move up but not below 1
	} else {
		newIndex = Math.min(currentList.length - 1, index + 1); // Move down but not beyond the list
	}

	console.log('123asdasdadasdada', newIndex);
	if (newIndex === index) return;

	// select the focused item from the window by getting the id first
	const newItem = currentList[newIndex];
	// data-id attribute
	const element = document.querySelector<HTMLElement>(`[data-id='${newItem.id}']`);
	element?.focus();

	// if moving up move cursor to end of element, if down move cursor to start of element
	if (direction === 'up') {
		const range = document.createRange();
		range.selectNodeContents(element!);
		range.collapse(false);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	} else {
		const range = document.createRange();
		range.selectNodeContents(element!);
		range.collapse(true);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}
}
