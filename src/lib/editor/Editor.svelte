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
	import Italic from '@tiptap/extension-italic';
	import BubbleMenu from '@tiptap/extension-bubble-menu';
	import ProjectChip from './nodes/ProjectChip';
	import { mergeDocuments, splitDocumentAt } from './tools';
	import { createEditorAPI } from './api';
	import { deepClone } from './utils/helpers';
	import { computeAbsolutePosForBlockOffset, computeBlockOffsetForAbsolutePos } from './utils/position';
	import { getSelectedTextWithCustomNodes } from './utils/selection';
	import { mergeConfig, type EditorConfig } from './config';
	import Button from '$lib/components/ui/button/button.svelte';
	import BoldIcon from 'lucide-svelte/icons/bold';
	import ItalicIcon from 'lucide-svelte/icons/italic';
	import UnderlineIcon from 'lucide-svelte/icons/underline';
	import LinkIcon from 'lucide-svelte/icons/link';

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

	let editor: TipTapEditor | null = null;
	let editorElement: HTMLElement | null = null;
	let bubbleMenuElement = $state<HTMLElement | null>(null);
	let _debounceTimer: number | null = null;
	let cursor: any = null;
	let contentAPI: any = null;
	let documentAPI: any = null;
	let formattingAPI: any = null;

	// Editor state signal (for Svelte 5 reactivity)
	let editorState = $state({ editor: null as TipTapEditor | null });

	// Merge user config with defaults
	const editorConfig = $derived(mergeConfig(config));

	// Bubble menu state
	let isBoldActive = $state(false);
	let isItalicActive = $state(false);
	let isUnderlineActive = $state(false);
	let isLinkActive = $state(false);

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

			// Update bubble menu button states using formatting API
			if (editorConfig.bubbleMenu && formattingAPI) {
				if (editorConfig.formatting?.bold && formattingAPI.isBoldActive) {
					isBoldActive = formattingAPI.isBoldActive();
				}
				if (editorConfig.formatting?.italic && formattingAPI.isItalicActive) {
					isItalicActive = formattingAPI.isItalicActive();
				}
				if (editorConfig.formatting?.underline && formattingAPI.isUnderlineActive) {
					isUnderlineActive = formattingAPI.isUnderlineActive();
				}
				if (editorConfig.links && formattingAPI.isLinkActive) {
					isLinkActive = formattingAPI.isLinkActive();
				}
			}

			// Force reactivity update for Svelte 5
			editorState = { editor };
		} catch {
			// Ignore errors
		}
	}

	// ============================================================================
	// Bubble Menu Actions
	// ============================================================================

	function toggleBold() {
		if (!formattingAPI?.toggleBold) return;
		formattingAPI.toggleBold();
		// Update button state immediately
		setTimeout(() => handleSelectionChange(), 0);
	}

	function toggleItalic() {
		if (!formattingAPI?.toggleItalic) return;
		formattingAPI.toggleItalic();
		// Update button state immediately
		setTimeout(() => handleSelectionChange(), 0);
	}

	function toggleUnderline() {
		if (!formattingAPI?.toggleUnderline) return;
		formattingAPI.toggleUnderline();
		// Update button state immediately
		setTimeout(() => handleSelectionChange(), 0);
	}

	function toggleLink() {
		if (!formattingAPI?.toggleLink) return;
		formattingAPI.toggleLink();
		// Update button state immediately
		setTimeout(() => handleSelectionChange(), 0);
	}

	function insertChip() {
		if (!editor || !contentAPI?.insertProjectChip) return;
		const id = prompt('Enter project ID:');
		if (id) {
			contentAPI.insertProjectChip(id);
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
				...(editorConfig.formatting?.bold ? [Bold] : []),			...(editorConfig.formatting?.italic ? [Italic] : []),				...(editorConfig.formatting?.underline ? [Underline] : []),
				...(editorConfig.links ? [Link.configure({ openOnClick: true })] : []),
				CharacterCount.configure({
					limit: characterLimit > 0 ? characterLimit : undefined
				}),
				...(editorConfig.projectChips ? [ProjectChip] : []),
				...(editorConfig.bubbleMenu && bubbleMenuElement
					? [
							BubbleMenu.configure({
								element: bubbleMenuElement
							})
						]
					: [])
			],
			content: deepClone(initial),
			editable,
			onUpdate: handleEditorUpdate,
			onCreate: handleEditorUpdate,
			onTransaction: () => {
				// Update the state signal to force a re-render (Svelte 5 pattern)
				editorState = { editor };
			}
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
		documentAPI = api.document;
		formattingAPI = api.formatting;

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
				documentAPI = null;
				formattingAPI = null;
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
	 * - editor.formatting.toggleBold(), editor.formatting.toggleUnderline(), etc.
	 *
	 * Usage in components:
	 * <Editor bind:this={editor} bind:content={doc} />
	 * editor.cursor.focus()
	 * editor.document.getJSON()
	 * editor.content.insertProjectChip('id')
	 * editor.formatting.toggleBold()
	 */
	export { cursor, contentAPI as content, documentAPI as document, formattingAPI as formatting }
</script>

<div class="editor-wrapper" bind:this={editorElement} aria-label="Rich text editor"></div>

{#if editorConfig.bubbleMenu}
	<div bind:this={bubbleMenuElement} class="bubble-menu flex gap-1 bg-card p-1 rounded-sm">
		{#if editorConfig.formatting?.bold}
			<Button
				onclick={toggleBold}
				variant={isBoldActive ? 'default' : 'ghost'}
				size="icon-sm"
				title="Bold"
			>
				<BoldIcon class="h-4 w-4" />
			</Button>
		{/if}

		{#if editorConfig.formatting?.italic}
			<Button
				onclick={toggleItalic}
				variant={isItalicActive ? 'default' : 'ghost'}
				size="icon-sm"
				title="Italic"
			>
				<ItalicIcon class="h-4 w-4" />
			</Button>
		{/if}

		{#if editorConfig.formatting?.underline}
			<Button
				onclick={toggleUnderline}
				variant={isUnderlineActive ? 'default' : 'ghost'}
				size="icon-sm"
				title="Underline"
			>
				<UnderlineIcon class="h-4 w-4" />
			</Button>
		{/if}

		{#if editorConfig.links}
			<Button
				onclick={toggleLink}
				variant={isLinkActive ? 'default' : 'ghost'}
				size="icon-sm"
				title="Link"
			>
				<LinkIcon class="h-4 w-4" />
			</Button>
		{/if}
	</div>
{/if}

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

	.bubble-menu {
		visibility: hidden;
		opacity: 0;
		transition: opacity 0.2s, visibility 0.2s;
		position: absolute;
		z-index: 1000;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		border: 1px solid hsl(var(--border));
	}

	/* Tiptap's BubbleMenu extension adds .is-active class when text is selected */
	:global(.bubble-menu.is-active) {
		visibility: visible;
		opacity: 1;
	}
</style>
