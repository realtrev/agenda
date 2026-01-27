import type { Editor as TipTapEditor } from '@tiptap/core';
import { mergeDocuments, splitDocumentAt } from '../tools';
import type { EditorConfig } from '../config';

export interface CharacterCountInfo {
	characters: number;
	words: number;
	limit: number | null;
	percentage: number;
}

/**
 * Document manipulation and metadata API
 */
export function createDocumentAPI(editor: TipTapEditor | null, characterLimit: number = 0, config: EditorConfig) {
	const api: any = {
		/**
		 * Get plain text content of the document.
		 */
		getPlainText(): string {
			if (!editor) return '';
			return editor.state.doc.textContent;
		},

		/**
		 * Check if the document is empty.
		 */
		isEmpty(): boolean {
			if (!editor) return true;
			return editor.isEmpty;
		},

		/**
		 * Get the number of blocks in the document.
		 */
		getBlockCount(): number {
			if (!editor) return 0;
			return editor.state.doc.childCount;
		},

		/**
		 * Get character count information.
		 * @returns { characters, words, limit, percentage } or null if editor not ready
		 */
		getCharacterCount(): CharacterCountInfo | null {
			if (!editor) return null;
			try {
				const storage = (editor as any).storage?.characterCount;
				if (!storage) return null;
				return {
					characters: storage.characters?.() || 0,
					words: storage.words?.() || 0,
					limit: characterLimit > 0 ? characterLimit : null,
					percentage: characterLimit > 0 ? Math.round((storage.characters?.() || 0) / characterLimit * 100) : 0
				};
			} catch {
				return null;
			}
		}
	};

	// Conditionally add methods based on config
	if (config.document?.getJSON !== false) {
		api.getJSON = function() {
			if (!editor) return null;
			return JSON.parse(JSON.stringify(editor.getJSON()));
		};
	}

	if (config.document?.setJSON !== false) {
		api.setJSON = function(doc: any, emitUpdate = false) {
			if (!editor) return;
			try {
				(editor.commands as any).setContent(doc, emitUpdate);
			} catch {
				// Ignore errors
			}
		};
	}

	if (config.document?.clear !== false) {
		api.clear = function(emitUpdate = false) {
			if (!editor) return;
			try {
				(editor.commands as any).clearContent(emitUpdate);
			} catch {
				// Ignore errors
			}
		};
	}

	if (config.document?.blocks !== false) {
		api.getBlock = function(index: number) {
			if (!editor) return null;
			const doc = editor.state.doc;
			if (index < 0 || index >= doc.childCount) return null;
			return doc.child(index).toJSON();
		};

		api.replaceBlock = function(index: number, newBlock: any): boolean {
			if (!editor) return false;
			const doc = editor.state.doc;
			if (index < 0 || index >= doc.childCount) return false;

			try {
				let pos = 1;
				for (let i = 0; i < index; i++) {
					pos += doc.child(i).nodeSize;
				}
				const block = doc.child(index);
				return (editor.commands as any).insertContentAt(
					{ from: pos, to: pos + block.nodeSize },
					newBlock
				);
			} catch {
				return false;
			}
		};
	}

	if (config.document?.merge !== false) {
		api.merge = function(a: any, b: any) {
			return mergeDocuments(a, b);
		};
	}

	if (config.document?.split !== false) {
		api.split = function(doc: any, pos: number | { blockIndex: number; offset: number }) {
			return splitDocumentAt(doc, pos);
		};
	}

	return api;
}

export type DocumentAPI = ReturnType<typeof createDocumentAPI>;
