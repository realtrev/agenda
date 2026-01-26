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

	// Helpers to convert between ProseMirror absolute positions and blockIndex/offset (character) coordinates
	function _childTextLength(child: any) {
		// For text nodes, use text length. For other inline nodes (atomic, etc.) treat as length 1.
		if (!child) return 0;
		if (child.isText) return child.text ? child.text.length : 0;
		// Non-text inline nodes count as a single character unit
		return 1;
	}

	function computeAbsolutePosForBlockOffset(blockIndex: number, offset: number) {
		if (!editor) return 1;
		const doc = editor.state.doc;
		let pos = 0; // position before first child of doc
		// add sizes of preceding blocks
		for (let i = 0; i < blockIndex && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
		if (blockIndex >= doc.childCount) return doc.content.size;
		const block = doc.child(blockIndex);
		// accumulate character counts across inline children
		let accum = 0;
		for (let j = 0; j < block.childCount; j++) {
			const child = block.child(j);
			const childLen = _childTextLength(child);
			// If the desired offset falls within this child, compute within-child position
			if (accum + childLen >= offset) {
				const within = Math.max(0, offset - accum);
				// absolute position: block start (pos) + 1 for inside node + accum + within
				return pos + 1 + accum + within;
			}
			accum += childLen;
		}
		// If offset beyond end of block, place at end of block
		return pos + block.nodeSize - 1;
	}

	function computeBlockOffsetForAbsolutePos(absPos: number) {
		if (!editor) return { blockIndex: 0, offset: 0 };
		const doc = editor.state.doc;
		// Clamp
		const pos = Math.max(1, Math.min(absPos, doc.content.size));
		let running = 1;
		for (let i = 0; i < doc.childCount; i++) {
			const block = doc.child(i);
			const blockStart = running;
			const blockEnd = running + block.nodeSize - 1; // inclusive
			running += block.nodeSize;
			if (pos >= blockStart && pos <= blockEnd) {
				// position inside this block. compute offset as character count from block start
				let accum = 0;
				let innerPos = pos - (blockStart + 1); // zero-based index into inline content
				if (innerPos < 0) innerPos = 0;
				for (let j = 0; j < block.childCount; j++) {
					const child = block.child(j);
					const childLen = _childTextLength(child);
					// If innerPos falls within this child's character range
					if (innerPos <= accum + (childLen - 1)) {
						const offsetInChild = innerPos - accum;
						return { blockIndex: i, offset: accum + Math.max(0, offsetInChild) };
					}
					accum += childLen;
				}
				// At end of block
				return { blockIndex: i, offset: accum };
			}
		}
		// Default to end
		return { blockIndex: Math.max(0, doc.childCount - 1), offset: 0 };
	}

	// Selection-change handler: called when the editor selection changes
	function handleSelectionChange() {
		if (!editor) return;
		try {
			const sel = editor.state.selection;
			const cursor = { from: sel.from, to: sel.to, empty: sel.empty };
			// compute block/offset positions for both ends
			const start = computeBlockOffsetForAbsolutePos(cursor.from);
			const end = computeBlockOffsetForAbsolutePos(cursor.to);
			const selectedText = sel.empty ? '' : editor.state.doc.textBetween(sel.from, sel.to, '\n');
			const payload = { selection: cursor, start, end, selectedText };
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
		const cursor = { from: sel.from, to: sel.to, empty: sel.empty };
		// compute block/offset versions for start/end
		const start = computeBlockOffsetForAbsolutePos(cursor.from);
		const end = computeBlockOffsetForAbsolutePos(cursor.to);
		return { ...cursor, start, end };
	}

	export function getSelectedText() {
		if (!editor) return '';
		const sel = editor.state.selection;
		if (sel.empty) return '';
		return editor.state.doc.textBetween(sel.from, sel.to, '\n');
	}

	// Place cursor by blockIndex and offset (character-based using inline text lengths)
	export function setCursor(position: number | { blockIndex: number; offset: number }) {
		if (!editor) return;
		const doc = editor.state.doc;

		let targetPos = 1;
		if (typeof position === 'number') {
			// interpret number as blockIndex (start of block)
			targetPos = computeAbsolutePosForBlockOffset(position, 0);
		} else {
			const { blockIndex, offset } = position;
			targetPos = computeAbsolutePosForBlockOffset(blockIndex, offset);
		}

		// Ensure targetPos within document bounds
		targetPos = Math.max(1, Math.min(targetPos, doc.content.size));

		// Use TipTap/ProseMirror command to set text selection; cast to any for compatibility
		try {
			(editor.commands as any).setTextSelection(targetPos as any);
		} catch (e) {
			// fallback: focus only
			editor.commands.focus();
		}
		// focus after setting
		editor.commands.focus();
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
