import type { Editor as TipTapEditor } from '@tiptap/core';
import type { EditorConfig } from '../config';

/**
 * Text formatting and styling API
 */
export function createFormattingAPI(editor: TipTapEditor | null, config: EditorConfig) {
	const api: any = {};

	// Bold formatting
	if (config.formatting?.bold) {
		api.toggleBold = function(): boolean {
			if (!editor) return false;
			try {
				return editor.chain().focus().toggleBold().run();
			} catch {
				return false;
			}
		};

		api.isBoldActive = function(): boolean {
			if (!editor) return false;
			return editor.isActive('bold');
		};
	}

	// Underline formatting
	if (config.formatting?.underline) {
		api.toggleUnderline = function(): boolean {
			if (!editor) return false;
			try {
				return editor.chain().focus().toggleUnderline().run();
			} catch {
				return false;
			}
		};

		api.isUnderlineActive = function(): boolean {
			if (!editor) return false;
			return editor.isActive('underline');
		};
	}

	// Link management
	if (config.links) {
		api.toggleLink = function(url?: string): boolean {
			if (!editor) return false;
			try {
				if (editor.isActive('link')) {
					return editor.chain().focus().unsetLink().run();
				} else {
					const href = url || prompt('Enter URL:');
					if (href) {
						return editor.chain().focus().setLink({ href }).run();
					}
					return false;
				}
			} catch {
				return false;
			}
		};

		api.setLink = function(url: string): boolean {
			if (!editor) return false;
			try {
				return editor.chain().focus().setLink({ href: url }).run();
			} catch {
				return false;
			}
		};

		api.unsetLink = function(): boolean {
			if (!editor) return false;
			try {
				return editor.chain().focus().unsetLink().run();
			} catch {
				return false;
			}
		};

		api.isLinkActive = function(): boolean {
			if (!editor) return false;
			return editor.isActive('link');
		};
	}

	return api;
}

export type FormattingAPI = ReturnType<typeof createFormattingAPI>;
