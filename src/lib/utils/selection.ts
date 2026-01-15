import { tick } from 'svelte';

export function splitFromCursor(node: HTMLElement) {
	const range = window.getSelection()?.getRangeAt(0);
	if (range) {
		const beforeRange = document.createRange();
		beforeRange.selectNodeContents(node);
		beforeRange.setEnd(range.startContainer, range.startOffset);

		const afterRange = document.createRange();
		afterRange.selectNodeContents(node);
		afterRange.setStart(range.startContainer, range.startOffset);

		const leftFrag = beforeRange.toString().trim();
		const rightFrag = afterRange.toString().trim();

		return [leftFrag, rightFrag];
	}
	return ['', ''];
}

export function isCursorAtStart(el: HTMLElement): boolean {
	const [left, _] = splitFromCursor(el);
	return left.length === 0;
}

export function isCursorAtEnd(el: HTMLElement): boolean {
	const [_, right] = splitFromCursor(el);
	return right.length === 0;
}

export async function setCursor(el: HTMLElement, position: number) {
	// 1. Wait for Svelte to finish updating the DOM
	await tick();

	// 2. Ensure the element is focused
	el.focus();

	const selection = window.getSelection();
	const range = document.createRange();

	// 3. Target the first text node inside the div
	// If the div is empty, we target the element itself
	const textNode = el.childNodes[0] || el;

	// 4. Set the range (start and end at the same spot for a cursor)
	let actualPosition = position;
	if (position < 0) actualPosition = textNode.length - position - 1;
	range.setStart(textNode, actualPosition);
	range.collapse(true);

	// 5. Apply the range to the window
	if (!selection) return;
	selection.removeAllRanges();
	selection.addRange(range);
}
