<script lang="ts">
	/**
	 * Svelte 5 runes-style TipTap Editor component
	 *
	 * - Uses $props() and $bindable for props and bindable content
	 * - Accepts callback props: onChange, onEnter, onBackspace
	 * - Exposes imperative methods via exported functions
	 *
	 * Notes:
	 * - This component assumes Svelte 5 runtime (runes available).
	 * - TipTap deps must be available in your project:
	 *   @tiptap/core, @tiptap/starter-kit, @tiptap/extension-link, @tiptap/extension-bold, @tiptap/extension-underline
	 */

	import { onMount, onDestroy } from 'svelte';
	import { Editor as TipTapEditor, Node as TipTapNode } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Bold from '@tiptap/extension-bold';
	import Underline from '@tiptap/extension-underline';
	import { mergeDocuments, splitDocumentAt } from './tools';

	// Props via runes
	// - `initial` must come before `content` because content's default references it
	let {
		initial = { type: 'doc', content: [] },
		editable = true,
		debounce = 300,
		// make `content` bindable (so parent can `bind:content`)
		content = $bindable(initial),
		// event callbacks (runes-style callback props)
		onChange,
		onEnter,
		onBackspace,
		// selection change callback: called with { selection: { from, to, empty }, selectedText }
		onSelectionChange
	}: any = $props();

	console.log('editor', content);

	// Local state
	let editor: TipTapEditor | null = null;
	let editorElement: HTMLElement | null = null;
	let _debounceTimer: number | null = null;

	// Simple deep clone helper
	function deepClone<T>(v: T): T {
		return JSON.parse(JSON.stringify(v));
	}

	// Minimal inline atomic node so JSON can contain atomic nodes
	const Atomic = TipTapNode.create({
		name: 'atomic',
		group: 'inline',
		inline: true,
		atom: true,
		selectable: true,
		draggable: false,
		addAttributes() {
			return {
				id: { default: null },
				data: { default: null }
			};
		},
		parseHTML() {
			return [{ tag: 'span[data-atomic]' }];
		},
		renderHTML({ HTMLAttributes }: any) {
			return ['span', { 'data-atomic': 'true', ...HTMLAttributes }, 0];
		}
	});

	// Called by TipTap on update; debounce and assign to bindable `content`
	function handleEditorUpdate() {
		if (!editor) return;
		const json = editor.getJSON();
		// Debounce updating the bound content and calling onChange
		if (_debounceTimer) {
			clearTimeout(_debounceTimer);
			_debounceTimer = null;
		}
		_debounceTimer = window.setTimeout(() => {
			// update bindable content (this writes back to parent)
			content = deepClone(json);
			// call callback prop if provided
			if (typeof onChange === 'function') {
				try {
					onChange({ content });
				} catch (e) {
					// swallow user callback errors
				}
			}
			_debounceTimer = null;
		}, debounce) as unknown as number;
	}

	// Keydown handler delegates to callback props (Svelte 5 style)
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (typeof onEnter === 'function') {
				try {
					onEnter({ event: e, selection: getCursor() });
				} catch (e) {
					/* swallow */
				}
			}
		} else if (e.key === 'Backspace') {
			if (typeof onBackspace === 'function') {
				try {
					onBackspace({ event: e, selection: getCursor() });
				} catch (e) {
					/* swallow */
				}
			}
		}
	}

	// Selection-change handler: called when the editor selection changes
	function handleSelectionChange() {
		if (!editor) return;
		try {
			const sel = editor.state.selection;
			const selectedText = sel.empty ? '' : editor.state.doc.textBetween(sel.from, sel.to, '\n');
			const payload = {
				selection: { from: sel.from, to: sel.to, empty: sel.empty },
				selectedText
			};
			if (typeof onSelectionChange === 'function') {
				try {
					onSelectionChange(payload);
				} catch (e) {
					/* swallow user callback errors */
				}
			}
		} catch {
			// ignore errors reading selection
		}
	}

	onMount(() => {
		editor = new TipTapEditor({
			element: editorElement as HTMLElement,
			extensions: [
				StarterKit.configure({}),
				Bold,
				Underline,
				Link.configure({ openOnClick: true }),
				Atomic
			],
			content: deepClone(initial),
			editable,
			onUpdate: handleEditorUpdate,
			onCreate: handleEditorUpdate
		});

		const dom = (editor as any).view?.dom;
		if (dom) dom.addEventListener('keydown', handleKeydown);

		// Listen to TipTap selection updates and notify parent via onSelectionChange
		try {
			if ((editor as any).on) {
				(editor as any).on('selectionUpdate', handleSelectionChange);
			}
		} catch {
			// if .on isn't available, we skip
		}

		// sync initial into bindable content (parent may not be bound yet)
		content = deepClone(initial);

		// fire an initial selection update so parent can reflect initial cursor state
		setTimeout(() => {
			handleSelectionChange();
		}, 0);

		return () => {
			if (editor) {
				const dom = (editor as any).view?.dom;
				if (dom) dom.removeEventListener('keydown', handleKeydown);
				try {
					if ((editor as any).off) {
						(editor as any).off('selectionUpdate', handleSelectionChange);
					}
				} catch {
					/* ignore */
				}
				editor.destroy();
				editor = null;
			}
		};
	});

	onDestroy(() => {
		if (editor) {
			const dom = (editor as any).view?.dom;
			if (dom) dom.removeEventListener('keydown', handleKeydown);
			try {
				if ((editor as any).off) {
					(editor as any).off('selectionUpdate', handleSelectionChange);
				}
			} catch {
				/* ignore */
			}
			editor.destroy();
			editor = null;
		}
	});

	// Keep editor content in sync when parent updates `content` externally.
	// Use $effect so it reacts to `content` changes.
	$effect(() => {
		if (!editor) return;
		try {
			const current = editor.getJSON();
			// Only set if different to avoid clobbering selection/undo
			if (current && JSON.stringify(current) !== JSON.stringify(content)) {
				// setContent's second arg types vary across tiptap versions; cast to any
				(editor.commands as any).setContent(deepClone(content), false as any);
			}
		} catch {
			// ignore errors from getJSON or setContent
		}
	});

	/**
	 * Imperative API (exports)
	 */

	export function focusEditor(position?: number | { blockIndex: number; offset: number }) {
		if (!editor) return;
		// If a position is provided, set the cursor before focusing.
		if (position !== undefined && position !== null) {
			try {
				// setCursor is exported below; calling it will compute and set selection.
				setCursor(position as any);
			} catch {
				// ignore any errors setting cursor
			}
		}
		editor.commands.focus();
	}

	export function getCursor() {
		if (!editor) return null;
		const sel = editor.state.selection;
		return { from: sel.from, to: sel.to, empty: sel.empty };
	}

	export function getSelectedText() {
		if (!editor) return '';
		const sel = editor.state.selection;
		if (sel.empty) return '';
		return editor.state.doc.textBetween(sel.from, sel.to, '\n');
	}

	// Place cursor by blockIndex and offset (approximate using nodeSize internals)
	export function setCursor(position: number | { blockIndex: number; offset: number }) {
		if (!editor) return;
		const doc = editor.state.doc;

		function computePosForBlockOffset(blockIndex: number, offset: number) {
			let pos = 0;
			for (let i = 0; i < blockIndex && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
			if (blockIndex >= doc.childCount) return doc.content.size;
			const block = doc.child(blockIndex);
			let accum = 0;
			for (let j = 0; j < block.childCount; j++) {
				const child = block.child(j);
				const childSize = child.nodeSize;
				if (accum + childSize >= offset) return pos + 1 + accum + Math.min(offset, childSize);
				accum += childSize;
			}
			return pos + block.nodeSize - 1;
		}

		if (typeof position === 'number') {
			const targetPos = computePosForBlockOffset(position, 0);
			editor.commands.setTextSelection(targetPos as any);
			editor.commands.focus();
		} else {
			const { blockIndex, offset } = position;
			const targetPos = computePosForBlockOffset(blockIndex, offset);
			editor.commands.setTextSelection(targetPos as any);
			editor.commands.focus();
		}
	}

	// Pure helpers exposure
	export function mergeDocs(a: any, b: any) {
		return mergeDocuments(a, b);
	}

	export function splitDocAtPosition(
		doc: any,
		pos: number | { blockIndex: number; offset: number }
	) {
		return splitDocumentAt(doc, pos);
	}
</script>

<!-- Editor mount point -->
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
</style>
