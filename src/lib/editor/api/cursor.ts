import type { Editor as TipTapEditor } from '@tiptap/core';
import { computeBlockOffsetForAbsolutePos, computeAbsolutePosForBlockOffset } from '../utils/position';
import type { EditorConfig } from '../config';

export interface CursorInfo {
	selection: { from: number; to: number; empty: boolean };
	start: { blockIndex: number; offset: number };
	end: { blockIndex: number; offset: number };
	selectedText: string;
}

/**
 * Cursor and selection management API
 */
export function createCursorAPI(
	editor: TipTapEditor | null,
	getSelectedTextWithCustomNodes: (from: number, to: number) => string,
	config: EditorConfig
) {
	const api: any = {
		/**
		 * Get current cursor/selection information.
		 * Returns: { selection, start, end, selectedText }
		 * - selection: { from, to, empty } (0-based positions)
		 * - start/end: { blockIndex, offset }
		 * - selectedText: String including custom node labels
		 */
		get(): CursorInfo | null {
			if (!editor) return null;
			const sel = editor.state.selection;

			// Convert from ProseMirror 1-based to 0-based positions (clamped to 0)
			const selection = {
				from: Math.max(0, sel.from - 1),
				to: Math.max(0, sel.to - 1),
				empty: sel.empty
			};
			const start = computeBlockOffsetForAbsolutePos(editor, sel.from);
			const end = computeBlockOffsetForAbsolutePos(editor, sel.to);
			const selectedText = sel.empty ? '' : getSelectedTextWithCustomNodes(sel.from, sel.to);

			return { selection, start, end, selectedText };
		},

		/**
		 * Check if cursor is at the start of the document.
		 */
		isAtStart(): boolean {
			if (!editor) return false;
			const sel = editor.state.selection;
			return sel.empty && sel.from <= 1;
		},

		/**
		 * Check if cursor is at the end of the document.
		 */
		isAtEnd(): boolean {
			if (!editor) return false;
			const sel = editor.state.selection;
			return sel.empty && sel.to >= editor.state.doc.content.size;
		}
	};

	// Conditionally add methods based on config
	if (config.cursor?.focus !== false) {
		api.focus = function(position?: number | { blockIndex: number; offset: number }) {
			if (!editor) return;
			if (position !== undefined && position !== null) {
				try {
					this.set(position as any);
				} catch {
					// Ignore
				}
			}
			editor.commands.focus();
		};
	}

	if (config.cursor?.set !== false) {
		api.set = function(position: number | { blockIndex: number; offset: number }) {
			if (!editor) return;
			const doc = editor.state.doc;

			let targetPos = 1;
			if (typeof position === 'number') {
				targetPos = computeAbsolutePosForBlockOffset(editor, position, 0);
			} else {
				const { blockIndex, offset } = position;
				targetPos = computeAbsolutePosForBlockOffset(editor, blockIndex, offset);
			}

			targetPos = Math.max(1, Math.min(targetPos, doc.content.size));

			try {
				(editor.commands as any).setTextSelection(targetPos);
			} catch {
				// Fallback to just focusing
			}

			editor.commands.focus();
		};
	}

	if (config.cursor?.selectAll !== false) {
		api.selectAll = function(): boolean {
			if (!editor) return false;
			try {
				return (editor.commands as any).selectAll();
			} catch {
				return false;
			}
		};
	}

	return api;
}

export type CursorAPI = ReturnType<typeof createCursorAPI>;
