<script lang="ts">
	/**
	 * TipTap Editor Component (Svelte 5)
	 *
	 * A rich text editor with custom ProjectChip nodes, position tracking, and document manipulation.
	 *
	 * Props:
	 *   - initial: Initial document JSON
	 *   - content: Bindable document state
	 *   - editable: Enable/disable editing
	 *   - debounce: Delay for onChange events (ms)
	 *   - characterLimit: Maximum number of characters (0 = unlimited)
	 *   - onChange, onEnter, onBackspace, onSelectionChange: Event callbacks
	 *
	 * API:
	 *   - focusEditor, setCursor, getCursor
	 *   - insertProjectChip
	 *   - mergeDocs, splitDocAtPosition
	 *   - isCursorAtStart, isCursorAtEnd
	 *   - getCharacterCount: Get current character count and limit info
	 */

	import { onMount, onDestroy } from 'svelte';
	import { Editor as TipTapEditor } from '@tiptap/core';
	import Document from '@tiptap/extension-document';
	import Paragraph from '@tiptap/extension-paragraph';
	import Text from '@tiptap/extension-text';
	import HardBreak from '@tiptap/extension-hard-break';
	import History from '@tiptap/extension-history';
	import Gapcursor from '@tiptap/extension-gapcursor';
	import Dropcursor from '@tiptap/extension-dropcursor';
	import Link from '@tiptap/extension-link';
	import Bold from '@tiptap/extension-bold';
	import Underline from '@tiptap/extension-underline';
	import CharacterCount from '@tiptap/extension-character-count';
	import ProjectChip from './nodes/ProjectChip';
	import { mergeDocuments, splitDocumentAt } from './tools';
	import { createEditorAPI } from './api';
	import { deepClone } from './utils/helpers';
	import { computeAbsolutePosForBlockOffset, computeBlockOffsetForAbsolutePos } from './utils/position';
	import { getSelectedTextWithCustomNodes } from './utils/selection';
	import { mergeConfig, type EditorConfig } from './config';

	// ============================================================================
	// Props & State
	// ============================================================================

	let {
		initial = { type: 'doc', content: [] },
		editable = true,
		debounce = 300,
		characterLimit = 0,
		config,
		content = $bindable(initial),
		onChange,
		onEnter,
		onBackspace,
		onSelectionChange
	}: any = $props();

	// Merge user config with defaults
	const editorConfig = mergeConfig(config);

	let editor: TipTapEditor | null = null;
	let editorElement: HTMLElement | null = null;
	let _debounceTimer: number | null = null;
	let cursor: any = null;
	let contentAPI: any = null;
	let document: any = null;

	// ============================================================================
	// Event Handlers
	// ============================================================================

	function handleEditorUpdate() {
		if (!editor) return;
		const json = editor.getJSON();

		if (_debounceTimer) clearTimeout(_debounceTimer);

		_debounceTimer = window.setTimeout(() => {
			content = deepClone(json);
			if (typeof onChange === 'function') {
				try {
					onChange({ content });
				} catch {
					// Swallow callback errors
				}
			}
			_debounceTimer = null;
		}, debounce) as unknown as number;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && typeof onEnter === 'function') {
			try {
				onEnter({ event: e, selection: cursor?.get?.() });
			} catch {
				// Swallow callback errors
			}
		} else if (e.key === 'Backspace' && typeof onBackspace === 'function') {
			try {
				onBackspace({ event: e, selection: cursor?.get?.() });
			} catch {
				// Swallow callback errors
			}
		}
	}

	function handleSelectionChange() {
		if (!editor) return;
		try {
			const payload = cursor?.get?.();
			if (payload && typeof onSelectionChange === 'function') {
				onSelectionChange(payload);
			}
		} catch {
			// Ignore errors
		}
	}

	// ============================================================================
	// Lifecycle Hooks
	// ============================================================================

	onMount(() => {
		editor = new TipTapEditor({
			element: editorElement as HTMLElement,
			extensions: [
				Document,
				Paragraph,
				Text,
				HardBreak,
				...(editorConfig.history ? [History] : []),
				Gapcursor,
				Dropcursor,
				...(editorConfig.formatting?.bold ? [Bold] : []),
				...(editorConfig.formatting?.underline ? [Underline] : []),
				...(editorConfig.links ? [Link.configure({ openOnClick: true })] : []),
				CharacterCount.configure({
					limit: characterLimit > 0 ? characterLimit : undefined
				}),
				...(editorConfig.projectChips ? [ProjectChip] : [])
			],
			content: deepClone(initial),
			editable,
			onUpdate: handleEditorUpdate,
			onCreate: handleEditorUpdate
		});

		// Initialize the API subsections
		const api = createEditorAPI(
			editor,
			characterLimit,
			(from: number, to: number) => getSelectedTextWithCustomNodes(editor, from, to),
			editorConfig
		);
		cursor = api.cursor;
		contentAPI = api.content;
		document = api.document;

		const dom = (editor as any).view?.dom;
		if (dom) dom.addEventListener('keydown', handleKeydown);

		// Listen to ProseMirror selection updates
		try {
			(editor as any).on?.('selectionUpdate', handleSelectionChange);
		} catch {
			// Ignore
		}

		// Listen to DOM selection events as fallback
		const domSelHandler = () => handleSelectionChange();
		window.addEventListener('mouseup', domSelHandler);
		window.addEventListener('keyup', domSelHandler);
		window.addEventListener('selectionchange', domSelHandler);

		content = initial;
		setTimeout(handleSelectionChange, 0);

		return () => {
			if (editor) {
				const dom = (editor as any).view?.dom;
				if (dom) dom.removeEventListener('keydown', handleKeydown);
				try {
					(editor as any).off?.('selectionUpdate', handleSelectionChange);
				} catch {
					// Ignore
				}
				window.removeEventListener('mouseup', domSelHandler);
				window.removeEventListener('keyup', domSelHandler);
				window.removeEventListener('selectionchange', domSelHandler);
				editor.destroy();
				editor = null;
				cursor = null;
				contentAPI = null;
				document = null;
			}
		};
	});

	onDestroy(() => {
		if (editor) {
			try {
				(editor as any).off?.('selectionUpdate');
			} catch {
				// Ignore
			}
			editor.destroy();
			editor = null;
		}
	});

	// Sync external content updates back to editor
	$effect(() => {
		if (!editor) return;
		try {
			const current = editor.getJSON();
			if (JSON.stringify(current) !== JSON.stringify(content)) {
				(editor.commands as any).setContent(content, false);
			}
		} catch {
			// Ignore
		}
	});

	// ============================================================================
	// Exported API
	// ============================================================================

	/**
	 * Organized editor API with subsections:
	 * - editor.cursor.focus(), editor.cursor.get(), editor.cursor.set(), etc.
	 * - editor.content.insertProjectChip(), editor.content.insertText(), etc.
	 * - editor.document.getJSON(), editor.document.getCharacterCount(), etc.
	 *
	 * Usage in components:
	 * <Editor bind:this={editor} bind:content={doc} />
	 * editor.cursor.focus()
	 * editor.document.getJSON()
	 * editor.content.insertProjectChip('id')
	 */
	export { cursor, contentAPI as content, document }
</script>

<div class="editor-wrapper" bind:this={editorElement} aria-label="Rich text editor"></div>

<style>
	.editor-wrapper {
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		padding: 12px;
		min-height: 120px;
		outline: none;
	}
	.editor-wrapper:focus-within {
		border-color: #8ab4f8;
		box-shadow: 0 0 0 3px rgba(138, 180, 248, 0.15);
	}

	:global(.project-chip[data-project-id='']) {
		opacity: 0.85;
	}
</style>
