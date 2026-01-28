import type { Editor as TipTapEditor } from '@tiptap/core';
import { createCursorAPI, type CursorAPI } from './cursor';
import { createContentAPI, type ContentAPI } from './content';
import { createDocumentAPI, type DocumentAPI } from './document';
import { createFormattingAPI, type FormattingAPI } from './formatting';
import { getSelectedTextWithCustomNodes } from '../utils/selection';
import type { EditorConfig } from '../config';

/**
 * Create the editor API subsections
 * Returns an object with cursor, content, document, and formatting subsections
 * that are exported directly on the editor component
 */
export function createEditorAPI(
	editor: TipTapEditor | null,
	characterLimit: number = 0,
	getSelectedTextWithCustomNodes_arg: (from: number, to: number) => string,
	config: EditorConfig
) {
	return {
		cursor: createCursorAPI(editor, getSelectedTextWithCustomNodes_arg, config),
		content: createContentAPI(editor, config),
		document: createDocumentAPI(editor, characterLimit, config),
		formatting: createFormattingAPI(editor, config)
	};
}

export type { CursorAPI, CursorInfo } from './cursor';
export type { ContentAPI } from './content';
export type { DocumentAPI, CharacterCountInfo } from './document';
export type { FormattingAPI } from './formatting';
