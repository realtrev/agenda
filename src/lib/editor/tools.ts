/**
 * Document Manipulation Utilities for TipTap/ProseMirror JSON
 *
 * Provides pure functions for merging and splitting TipTap documents without
 * requiring the TipTap runtime. All operations work on JSON document structures.
 *
 * Key Functions:
 *   - mergeDocuments: Intelligently merge two documents
 *   - splitDocumentAt: Split a document at a position
 *
 * Features:
 *   - Preserves text marks (bold, links, etc.) during splits
 *   - Merges adjacent text nodes with identical marks
 *   - Handles both absolute positions and {blockIndex, offset} coordinates
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type PMMark = {
	type: string;
	attrs?: Record<string, any>;
};

export type PMNode = {
	type: string;
	attrs?: Record<string, any>;
	content?: PMNode[];
	text?: string;
	marks?: PMMark[];
};

export type PMDoc = {
	type: 'doc';
	content: PMNode[];
};

// ============================================================================
// Utility Functions
// ============================================================================

function deepClone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

function isTextNode(n: PMNode): boolean {
	return n && n.type === 'text' && typeof n.text === 'string';
}

function attrsEqual(a?: Record<string, any>, b?: Record<string, any>): boolean {
	const aa = a || {};
	const bb = b || {};
	const keys = Object.keys(aa);
	if (keys.length !== Object.keys(bb).length) return false;
	return keys.every(k => aa[k] === bb[k]);
}

function marksEqual(a?: PMMark[], b?: PMMark[]): boolean {
	if (!a && !b) return true;
	if (!a || !b || a.length !== b.length) return false;
	return a.every((mark, i) => mark.type === b[i].type && attrsEqual(mark.attrs, b[i].attrs));
}

// ============================================================================
// Document Merging
// ============================================================================

/**
 * Merge two inline content arrays (e.g., content within a paragraph).
 * - Adjacent text nodes with identical marks are concatenated
 * - Adjacent nodes with same type/attrs and content are merged recursively
 * - Other nodes are appended as-is
 */
function mergeInlineArrays(left: PMNode[], right: PMNode[]): PMNode[] {
	const result: PMNode[] = left.map(deepClone);

	for (const node of right) {
		const prev = result[result.length - 1];

		if (!prev) {
			result.push(deepClone(node));
			continue;
		}

		// Merge adjacent text nodes with identical marks
		if (isTextNode(prev) && isTextNode(node) && marksEqual(prev.marks, node.marks)) {
			prev.text = (prev.text || '') + (node.text || '');
			continue;
		}

		// Merge adjacent non-text nodes with same type/attrs that have content
		if (
			!isTextNode(prev) &&
			!isTextNode(node) &&
			prev.type === node.type &&
			attrsEqual(prev.attrs, node.attrs) &&
			Array.isArray(prev.content) &&
			Array.isArray(node.content)
		) {
			prev.content = mergeInlineArrays(prev.content, node.content);
			continue;
		}

		// Default: append as separate node
		result.push(deepClone(node));
	}

	return result;
}

/**
 * Normalize a document by merging adjacent text nodes with identical marks.
 * Applied recursively to all blocks and nested content.
 */
function normalizeInlineTextNodes(doc: PMDoc): void {
	if (!doc || !Array.isArray(doc.content)) return;

	doc.content = doc.content.map((block) => {
		const normalized = deepClone(block);

		if (!Array.isArray(normalized.content)) return normalized;

		// Merge adjacent compatible nodes
		const merged: PMNode[] = [];
		for (const child of normalized.content) {
			if (merged.length === 0) {
				merged.push(deepClone(child));
				continue;
			}

			const prev = merged[merged.length - 1];

			if (isTextNode(prev) && isTextNode(child) && marksEqual(prev.marks, child.marks)) {
				prev.text = (prev.text || '') + (child.text || '');
			} else if (
				!isTextNode(prev) &&
				!isTextNode(child) &&
				prev.type === child.type &&
				attrsEqual(prev.attrs, child.attrs) &&
				Array.isArray(prev.content) &&
				Array.isArray(child.content)
			) {
				prev.content = mergeInlineArrays(prev.content, child.content);
			} else {
				merged.push(deepClone(child));
			}
		}

		// Recursively normalize nested content
		normalized.content = merged.map((node) => {
			if (Array.isArray(node.content)) {
				const nestedDoc: PMDoc = { type: 'doc', content: [node] };
				normalizeInlineTextNodes(nestedDoc);
				return nestedDoc.content[0];
			}
			return node;
		});

		return normalized;
	});
}

/**
 * Merge two documents into a single document.
 *
 * Rules:
 * - Concatenates top-level blocks
 * - If last block of A and first block of B have same type/attrs, merges their content
 * - Normalizes adjacent text nodes with identical marks
 *
 * @param a First document (or null)
 * @param b Second document (or null)
 * @returns Merged document
 */
export function mergeDocuments(a: PMDoc | null | undefined, b: PMDoc | null | undefined): PMDoc {
	const docA: PMDoc = deepClone(a || { type: 'doc', content: [] });
	const docB: PMDoc = deepClone(b || { type: 'doc', content: [] });

	const contentA = Array.isArray(docA.content) ? docA.content : [];
	const contentB = Array.isArray(docB.content) ? docB.content : [];

	// Handle empty documents
	if (contentA.length === 0) {
		const result: PMDoc = { type: 'doc', content: contentB };
		normalizeInlineTextNodes(result);
		return result;
	}
	if (contentB.length === 0) {
		const result: PMDoc = { type: 'doc', content: contentA };
		normalizeInlineTextNodes(result);
		return result;
	}

	const lastA = contentA[contentA.length - 1];
	const firstB = contentB[0];

	// Merge adjacent blocks if they have the same type and attributes
	if (lastA.type === firstB.type && attrsEqual(lastA.attrs, firstB.attrs)) {
		const leftContent = Array.isArray(lastA.content) ? lastA.content : [];
		const rightContent = Array.isArray(firstB.content) ? firstB.content : [];
		const mergedContent = mergeInlineArrays(leftContent, rightContent);

		const mergedBlock: PMNode = { ...deepClone(lastA), content: mergedContent };
		const result: PMDoc = {
			type: 'doc',
			content: [...contentA.slice(0, -1), mergedBlock, ...contentB.slice(1)]
		};
		normalizeInlineTextNodes(result);
		return result;
	}

	// Concatenate without merging
	const result: PMDoc = { type: 'doc', content: [...contentA, ...contentB] };
	normalizeInlineTextNodes(result);
	return result;
}

// ============================================================================
// Document Splitting
// ============================================================================

/**
 * Compute block lengths for position mapping.
 * Text characters count as their string length, non-text inline nodes count as 1.
 */
function computeBlockLengths(doc: PMDoc): { total: number; blockLengths: Array<{ blockIndex: number; length: number }> } {
	const blocks = doc.content || [];
	const blockLengths = blocks.map((block, i) => {
		let length = 0;
		if (Array.isArray(block.content)) {
			for (const inline of block.content) {
				length += isTextNode(inline) ? (inline.text || '').length : 1;
			}
		}
		return { blockIndex: i, length };
	});
	const total = blockLengths.reduce((sum, b) => sum + b.length, 0);
	return { total, blockLengths };
}

/**
 * Convert absolute position to {blockIndex, offset} coordinates.
 */
function absolutePosToBlockOffset(
	doc: PMDoc,
	pos: number
): { blockIndex: number; offset: number; total: number } {
	const { total, blockLengths } = computeBlockLengths(doc);

	if (pos <= 0) return { blockIndex: 0, offset: 0, total };
	if (pos >= total || blockLengths.length === 0) {
		const lastIndex = Math.max(0, blockLengths.length - 1);
		const lastOffset = blockLengths[lastIndex]?.length || 0;
		return { blockIndex: lastIndex, offset: lastOffset, total };
	}

	let accumulated = 0;
	for (const block of blockLengths) {
		if (accumulated + block.length >= pos) {
			return { blockIndex: block.blockIndex, offset: pos - accumulated, total };
		}
		accumulated += block.length;
	}

	// Fallback to end of last block
	const lastIndex = blockLengths.length - 1;
	return { blockIndex: lastIndex, offset: blockLengths[lastIndex].length, total };
}

/**
 * Split a single block at the given offset within its inline content.
 * Preserves marks when splitting text nodes.
 */
function splitBlockAtOffset(block: PMNode, offset: number): [PMNode, PMNode] {
	const createBlock = (content: PMNode[]): PMNode => ({
		type: block.type,
		attrs: block.attrs ? deepClone(block.attrs) : undefined,
		content
	});

	if (!Array.isArray(block.content) || block.content.length === 0) {
		return [createBlock([]), createBlock([])];
	}

	const leftContent: PMNode[] = [];
	const rightContent: PMNode[] = [];
	let remaining = offset;

	for (const inline of block.content) {
		if (remaining <= 0) {
			rightContent.push(deepClone(inline));
			continue;
		}

		if (isTextNode(inline)) {
			const text = inline.text || '';
			if (text.length <= remaining) {
				leftContent.push(deepClone(inline));
				remaining -= text.length;
			} else {
				// Split text node, preserving marks
				const createTextNode = (txt: string): PMNode => ({
					type: 'text',
					text: txt,
					...(inline.marks && { marks: deepClone(inline.marks) })
				});

				const leftText = createTextNode(text.slice(0, remaining));
				const rightText = createTextNode(text.slice(remaining));

				if (leftText?.text?.length && leftText.text.length > 0) leftContent.push(leftText);
				if (rightText?.text?.length && rightText.text.length > 0) rightContent.push(rightText);
				remaining = 0;
			}
		} else {
			// Non-text inline node (length = 1)
			if (remaining > 0) {
				leftContent.push(deepClone(inline));
				remaining -= 1;
			} else {
				rightContent.push(deepClone(inline));
			}
		}
	}

	return [createBlock(leftContent), createBlock(rightContent)];
}

/**
 * Split a document at the specified position.
 *
 * @param doc Document to split
 * @param pos Position: number (absolute) or {blockIndex, offset}
 * @returns {left, right} - Two new documents
 */
export function splitDocumentAt(
	doc: PMDoc,
	pos: number | { blockIndex: number; offset: number }
): { left: PMDoc; right: PMDoc } {
	const cloned = deepClone(doc || { type: 'doc', content: [] });
	const blocks = Array.isArray(cloned.content) ? cloned.content : [];

	// Convert position to blockIndex/offset if needed
	let target: { blockIndex: number; offset: number };
	if (typeof pos === 'number') {
		const result = absolutePosToBlockOffset(cloned, pos);
		target = { blockIndex: result.blockIndex, offset: result.offset };
	} else {
		target = pos;
	}

	// Clamp to valid range
	const blockIndex = Math.max(0, Math.min(target.blockIndex, Math.max(0, blocks.length - 1)));
	const offset = Math.max(0, target.offset);

	if (blocks.length === 0) {
		return {
			left: { type: 'doc', content: [] },
			right: { type: 'doc', content: [] }
		};
	}

	// Build left and right documents
	const leftContent = blocks.slice(0, blockIndex).map(deepClone);
	const rightContent = blocks.slice(blockIndex + 1).map(deepClone);

	const [leftBlock, rightBlock] = splitBlockAtOffset(blocks[blockIndex], offset);

	const leftDoc: PMDoc = { type: 'doc', content: [...leftContent, leftBlock] };
	const rightDoc: PMDoc = { type: 'doc', content: [rightBlock, ...rightContent] };

	// Normalize both documents
	normalizeInlineTextNodes(leftDoc);
	normalizeInlineTextNodes(rightDoc);

	return { left: leftDoc, right: rightDoc };
}

// ============================================================================
// Exports (Aliases for backward compatibility)
// ============================================================================

export const mergeDocs = mergeDocuments;
export const splitDocAt = splitDocumentAt;
