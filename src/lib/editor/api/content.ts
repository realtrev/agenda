import type { Editor as TipTapEditor } from '@tiptap/core';

/**
 * Content insertion and node manipulation API
 */
export function createContentAPI(editor: TipTapEditor | null) {
	return {
		/**
		 * Insert a ProjectChip node at current cursor position.
		 * @param projectId - ID of the project
		 * @returns true if successful
		 */
		insertProjectChip(projectId: string): boolean {
			if (!editor) return false;
			try {
				(editor.commands as any).insertContent({ type: 'projectChip', attrs: { projectId } });
				return true;
			} catch {
				return false;
			}
		},

		/**
		 * Insert text at the current cursor position.
		 * @param text - Text to insert
		 */
		insertText(text: string): boolean {
			if (!editor) return false;
			try {
				return (editor.commands as any).insertContent(text);
			} catch {
				return false;
			}
		},

		/**
		 * Insert content at a specific position.
		 * @param position - Absolute position or {blockIndex, offset}
		 * @param content - Content to insert
		 */
		insertAt(
			position: number | { blockIndex: number; offset: number },
			content: any
		): boolean {
			if (!editor) return false;
			try {
				let pos = 1;
				if (typeof position === 'number') {
					pos = position + 1; // Convert to 1-based
				} else {
					// Would need helper to convert blockIndex/offset to absolute
					// For now, just insert at cursor
					return this.insertText(content);
				}
				return (editor.commands as any).insertContentAt(pos, content);
			} catch {
				return false;
			}
		},

		/**
		 * Delete a range of content.
		 * @param from - Start position
		 * @param to - End position
		 */
		deleteRange(from: number, to: number): boolean {
			if (!editor) return false;
			try {
				return (editor.commands as any).deleteRange({ from: from + 1, to: to + 1 });
			} catch {
				return false;
			}
		}
	};
}

export type ContentAPI = ReturnType<typeof createContentAPI>;
