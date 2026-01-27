import type { Editor as TipTapEditor } from '@tiptap/core';
import { createCursorAPI, type CursorAPI } from './cursor';
import { createContentAPI, type ContentAPI } from './content';
import { createDocumentAPI, type DocumentAPI } from './document';

/**
 * Create the editor API subsections
 * Returns an object with cursor, content, and document subsections
 * that are exported directly on the editor component
 */
export function createEditorAPI(
	editor: TipTapEditor | null,
	characterLimit: number = 0,
	getSelectedTextWithCustomNodes: (from: number, to: number) => string,
	computeBlockOffsetForAbsolutePos: (absPos: number) => { blockIndex: number; offset: number },
	computeAbsolutePosForBlockOffset: (blockIndex: number, offset: number) => number
) {
	return {
		cursor: createCursorAPI(
			editor,
			getSelectedTextWithCustomNodes,
			computeBlockOffsetForAbsolutePos,
			computeAbsolutePosForBlockOffset
		),
		content: createContentAPI(editor),
		document: createDocumentAPI(editor, characterLimit)
	};
}

export type { CursorAPI, CursorInfo } from './cursor';
export type { ContentAPI } from './content';
export type { DocumentAPI, CharacterCountInfo } from './document';
