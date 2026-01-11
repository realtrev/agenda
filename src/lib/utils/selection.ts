export function isCursorAtStart(el: HTMLElement): boolean {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return false;
	const range = selection.getRangeAt(0);
	// Returns true if the cursor is at offset 0 of the first text node
	return range.startOffset === 0 && range.collapsed;
}

export function isCursorAtEnd(el: HTMLElement): boolean {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return false;
	console.log('asdasd', selection?.getRangeAt(0));

	const range = selection.getRangeAt(0);
	// find the length of the elements text
	const length = el.textContent?.length || 0;
	// Returns true if the cursor is at the end of the text node
	console.log('length', length, range.startOffset);
	return range.startOffset === length && range.collapsed;
}
