import type { Editor as TipTapEditor } from '@tiptap/core';
import { createCursorAPI } from './cursor';
import { createContentAPI } from './content';
import { createDocumentAPI } from './document';
import { createFormattingAPI } from './formatting';
import { createPopupAPI } from './popup';
import type { EditorConfig } from '../config';

/**
 * Create the editor API subsections
 * Returns an object with cursor, content, document, formatting, and popup subsections
 * that are exported directly on the editor component
 */
export function createEditorAPI(
	editor: TipTapEditor | null,
	getSelectedTextWithCustomNodes_arg: (from: number, to: number) => string,
	config: EditorConfig,
	characterLimit: number = 0,
	LinkPopupComponent?: any,
	onPopupStateChange?: (state: any) => void
) {
	const popupAPI = editor ? createPopupAPI(editor, LinkPopupComponent, onPopupStateChange || (() => {})) : null;

	return {
		cursor: createCursorAPI(editor, getSelectedTextWithCustomNodes_arg, config),
		content: createContentAPI(editor, config),
		document: createDocumentAPI(editor, characterLimit, config),
		formatting: createFormattingAPI(editor, config),
		popup: popupAPI
	};
}

export type { CursorAPI, CursorInfo } from './cursor';

export type { ContentAPI } from './content';
export type { DocumentAPI, CharacterCountInfo } from './document';
export type { FormattingAPI } from './formatting';
export type { PopupAPI, PopupConfig, PopupState } from './popup';
