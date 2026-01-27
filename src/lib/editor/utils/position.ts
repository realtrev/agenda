import type { Editor as TipTapEditor } from '@tiptap/core';

/**
 * Position conversion utilities for ProseMirror ↔ BlockIndex/Offset
 *
 * ProseMirror uses 1-based absolute positions.
 * BlockIndex/Offset is a user-friendly representation: {blockIndex, offset within block}
 */

function _childTextLength(child: any): number {
	if (!child) return 0;
	if (child.isText) return child.text ? child.text.length : 0;
	return 1; // Non-text inline nodes count as 1
}

/**
 * Convert {blockIndex, offset} to ProseMirror absolute position.
 * ProseMirror uses 1-based positions where position 1 is start of first block.
 */
export function computeAbsolutePosForBlockOffset(
	editor: TipTapEditor | null,
	blockIndex: number,
	offset: number
): number {
	if (!editor) return 1;
	const doc = editor.state.doc;
	const numBlocks = doc.childCount;

	// Clamp block index to valid range
	let bi = Math.max(0, Math.min(blockIndex, numBlocks - 1));
	let ofs = Math.max(0, offset);

	// Calculate position by summing sizes of blocks before target
	let pos = 1;
	for (let i = 0; i < bi && i < numBlocks; i++) {
		pos += doc.child(i).nodeSize;
	}

	if (bi >= numBlocks) return doc.content.size;

	const block = doc.child(bi);
	if (!block) return doc.content.size;

	// Find offset within block's inline content
	let accum = 0;
	for (let j = 0; j < block.childCount; j++) {
		const child = block.child(j);
		const childLen = _childTextLength(child);
		if (accum + childLen >= ofs) {
			return pos + accum + Math.max(0, Math.min(childLen, ofs - accum));
		}
		accum += childLen;
	}

	return pos + block.nodeSize - 1;
}

/**
 * Convert ProseMirror absolute position to {blockIndex, offset}.
 * Returns the block index and character offset within that block's content.
 */
export function computeBlockOffsetForAbsolutePos(
	editor: TipTapEditor | null,
	absPos: number
): { blockIndex: number; offset: number } {
	if (!editor) return { blockIndex: 0, offset: 0 };
	const doc = editor.state.doc;
	const pos = Math.max(1, Math.min(absPos, doc.content.size));

	let running = 1;
	for (let i = 0; i < doc.childCount; i++) {
		const block = doc.child(i);
		const blockStart = running;
		const blockEnd = running + block.nodeSize - 1;
		running += block.nodeSize;

		if (pos >= blockStart && pos <= blockEnd) {
			// Position relative to start of block content
			// blockStart is the first content position (offset 0)
			let innerPos = pos - blockStart;

			// If position is before block content, return offset 0
			if (innerPos < 0) {
				return { blockIndex: i, offset: 0 };
			}

			// Walk through child nodes to find the correct offset
			// (handles mixed text and inline nodes like ProjectChip)
			let accum = 0;
			for (let j = 0; j < block.childCount; j++) {
				const child = block.child(j);
				const childLen = _childTextLength(child);

				// Check if position falls within or before this child
				if (innerPos < accum + childLen) {
					// innerPos already represents the correct offset
					return { blockIndex: i, offset: innerPos };
				}
				accum += childLen;
			}

			// Position is at or after end of block content
			return { blockIndex: i, offset: accum };
		}
	}

	return { blockIndex: Math.max(0, doc.childCount - 1), offset: 0 };
}
