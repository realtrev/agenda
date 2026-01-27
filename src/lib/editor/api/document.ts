import type { Editor as TipTapEditor } from '@tiptap/core';
import { mergeDocuments, splitDocumentAt } from '../tools';

export interface CharacterCountInfo {
	characters: number;
	words: number;
	limit: number | null;
	percentage: number;
}

/**
 * Document manipulation and metadata API
 */
export function createDocumentAPI(editor: TipTapEditor | null, characterLimit: number = 0) {
	return {
		/**
		 * Get the entire document as JSON.
		 */
		getJSON() {
			if (!editor) return null;
			return JSON.parse(JSON.stringify(editor.getJSON()));
		},

		/**
		 * Set the entire document content.
		 * @param doc - Document JSON to set
		 * @param emitUpdate - Whether to trigger onChange callback
		 */
		setJSON(doc: any, emitUpdate = false) {
			if (!editor) return;
			try {
				(editor.commands as any).setContent(doc, emitUpdate);
			} catch {
				// Ignore errors
			}
		},

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
		 * Clear all content from the editor.
		 */
		clear(emitUpdate = false) {
			if (!editor) return;
			try {
				(editor.commands as any).clearContent(emitUpdate);
			} catch {
				// Ignore errors
			}
		},

		/**
		 * Get the number of blocks in the document.
		 */
		getBlockCount(): number {
			if (!editor) return 0;
			return editor.state.doc.childCount;
		},

		/**
		 * Get a specific block by index.
		 * @param index - Block index
		 */
		getBlock(index: number) {
			if (!editor) return null;
			const doc = editor.state.doc;
			if (index < 0 || index >= doc.childCount) return null;
			return doc.child(index).toJSON();
		},

		/**
		 * Replace a specific block.
		 * @param index - Block index
		 * @param newBlock - New block content
		 */
		replaceBlock(index: number, newBlock: any): boolean {
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
		},

		/**
		 * Merge two documents.
		 */
		merge(a: any, b: any) {
			return mergeDocuments(a, b);
		},

		/**
		 * Split document at position.
		 */
		split(doc: any, pos: number | { blockIndex: number; offset: number }) {
			return splitDocumentAt(doc, pos);
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
}

export type DocumentAPI = ReturnType<typeof createDocumentAPI>;
