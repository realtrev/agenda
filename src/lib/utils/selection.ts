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

/**
 * Robustly set the caret inside an element.
 *
 * Behavior:
 * - Wait for DOM updates (tick)
 * - Focus the element
 * - Treat `position` as a character offset into the element's flattened textContent.
 *   * If `position` is negative, count from the end (e.g. -1 means last character).
 * - Clamp `position` into [0, textLength].
 * - Walk the element's text nodes to find the node that contains the requested offset
 *   and place the caret there. If no text nodes exist, fall back to setting the range
 *   on the element itself at an appropriate child index (safe for empty elements).
 * - Wrap in try/catch to avoid uncaught DOMExceptions; fallback to selecting node contents.
 */
export async function setCursor(el: HTMLElement, position: number) {
	// 1. Wait for Svelte to finish updating the DOM
	await tick();

	// 2. Ensure the element is focused
	try {
		el.focus();
	} catch {
		// ignore focus errors
	}

	const sel = window.getSelection();
	if (!sel) return;

	const range = document.createRange();

	// Compute the flattened text length and clamp desired position
	const text = el.textContent ?? '';
	let desired = typeof position === 'number' && !isNaN(position) ? position : text.length;
	if (desired < 0) {
		desired = Math.max(0, text.length + desired);
	}
	desired = Math.max(0, Math.min(desired, text.length));

	// If there's no text content, place caret inside the element at child index 0 (or end)
	if (text.length === 0) {
		try {
			// choose to collapse at the start (0) or end (child count) — prefer end
			const childCount = el.childNodes.length;
			range.setStart(el, Math.max(0, Math.min(childCount, 0)));
			range.collapse(true);
			sel.removeAllRanges();
			sel.addRange(range);
			return;
		} catch {
			// final fallback: select the element contents and collapse
			try {
				range.selectNodeContents(el);
				range.collapse(false);
				sel.removeAllRanges();
				sel.addRange(range);
			} catch {
				// give up silently — don't throw
			}
			return;
		}
	}

	// Walk text nodes to find the node containing the desired offset
	try {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
		let node = walker.nextNode() as Text | null;
		let remaining = desired;
		let found: Text | null = null;
		let offsetInNode = 0;

		while (node) {
			const len = node.data.length;
			if (remaining <= len) {
				found = node;
				offsetInNode = remaining;
				break;
			}
			remaining -= len;
			node = walker.nextNode() as Text | null;
		}

		if (found) {
			// Clamp offset into [0, found.length]
			const clamped = Math.max(0, Math.min(offsetInNode, found.data.length));
			range.setStart(found, clamped);
			range.collapse(true);
			sel.removeAllRanges();
			sel.addRange(range);
			return;
		}

		// If no text node found (highly unlikely since text.length > 0),
		// fall back to collapsing at end of element.
		range.selectNodeContents(el);
		range.collapse(false);
		sel.removeAllRanges();
		sel.addRange(range);
		return;
	} catch {
		// On any DOMException or unexpected error, attempt a safe fallback
		try {
			range.selectNodeContents(el);
			range.collapse(false);
			sel.removeAllRanges();
			sel.addRange(range);
		} catch {
			// swallow errors to avoid uncaught exceptions
		}
		return;
	}
}
