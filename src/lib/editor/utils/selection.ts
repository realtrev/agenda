import type { Editor as TipTapEditor } from '@tiptap/core';
import { resolveLabel } from '../nodes/ProjectChip';

/**
 * Selection and text extraction utilities
 */

/**
 * Extract selected text, including custom node labels (e.g., ProjectChip → "#AP Gov").
 * Walks through the selection range and renders each node appropriately.
 */
export function getSelectedTextWithCustomNodes(
	editor: TipTapEditor | null,
	from: number,
	to: number
): string {
	if (!editor) return '';
	const doc = editor.state.doc;
	let result = '';
	let isFirstBlock = true;

	doc.nodesBetween(from, to, (node: any, pos: number) => {
		// Add newline between block nodes (paragraphs, headings, etc.)
		if (node.isBlock && node.type.name !== 'doc') {
			if (!isFirstBlock && result.length > 0) {
				result += '\n';
			}
			isFirstBlock = false;
		}

		if (node.isText) {
			// Extract the portion of text within selection bounds
			const nodeFrom = Math.max(from, pos);
			const nodeTo = Math.min(to, pos + node.nodeSize);
			if (nodeTo > nodeFrom) {
				result += node.text?.slice(nodeFrom - pos, nodeTo - pos) ?? '';
			}
		} else if (node.type.name === 'projectChip' && pos >= from && pos < to) {
			// Render ProjectChip using its label resolver
			const projectId = node.attrs?.projectId ?? null;
			const projectName = node.attrs?.projectName ?? null;
			result += resolveLabel(projectId, projectName);
		}
	});

	return result;
}
