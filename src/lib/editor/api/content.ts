import type { Editor as TipTapEditor } from '@tiptap/core';
import type { EditorConfig } from '../config';

/**
 * Content insertion and node manipulation API
 */
export function createContentAPI(editor: TipTapEditor | null, config: EditorConfig) {
	const api: any = {};

	// Conditionally add methods based on config
	if (config.projectChips) {
		api.insertProjectChip = function(projectId: string): boolean {
			if (!editor) return false;
			try {
				(editor.commands as any).insertContent({ type: 'projectChip', attrs: { projectId } });
				return true;
			} catch {
				return false;
			}
		};
	}

	if (config.content?.insertText !== false) {
		api.insertText = function(text: string): boolean {
			if (!editor) return false;
			try {
				return (editor.commands as any).insertContent(text);
			} catch {
				return false;
			}
		};

		api.insertAt = function(
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
		};
	}

	if (config.content?.deleteRange !== false) {
		api.deleteRange = function(from: number, to: number): boolean {
			if (!editor) return false;
			try {
				return (editor.commands as any).deleteRange({ from: from + 1, to: to + 1 });
			} catch {
				return false;
			}
		};
	}

	return api;
}

export type ContentAPI = ReturnType<typeof createContentAPI>;
