<script lang="ts">
	/**
	 * TipTap Editor (Svelte 5 runes-style)
	 *
	 * Rewritten to use a proper ProjectChip node (NodeView) for project chips instead of DOM-hydration.
	 *
	 * Props / Bindings:
	 * - `initial` (object) : initial TipTap JSON doc
	 * - `content` (bindable) : use `bind:content` to keep document in sync
	 * - `editable` (boolean)
	 * - `debounce` (ms) for onChange
	 *
	 * Callback props:
	 * - `onChange({ content })`
	 * - `onEnter({ event, selection })`
	 * - `onBackspace({ event, selection })`
	 * - `onSelectionChange(payload)`:
	 *     { selection: { from,to,empty }, start: {blockIndex,offset}, end: {blockIndex,offset}, selectedText }
	 *
	 * Exported API (via bind:this on the component instance):
	 * - focusEditor(position?)
	 * - setCursor(position)
	 * - getCursor()
	 * - getSelectedText()
	 * - insertProjectChip(projectId)
	 * - mergeDocs / splitDocAtPosition
	 * - isCursorAtStart / isCursorAtEnd
	 */

	import { onMount, onDestroy } from 'svelte';
	import { Editor as TipTapEditor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Bold from '@tiptap/extension-bold';
	import Underline from '@tiptap/extension-underline';
	// ProjectChip node (NodeView implementation)
	import ProjectChip from './nodes/ProjectChip';

	// Pure helpers
	import { mergeDocuments, splitDocumentAt } from './tools';

	// Props (Svelte 5 runes style)
	let {
		initial = { type: 'doc', content: [] },
		editable = true,
		debounce = 300,
		content = $bindable(initial),
		onChange,
		onEnter,
		onBackspace,
		onSelectionChange
	}: any = $props();

	// Local state
	let editor: TipTapEditor | null = null;
	let editorElement: HTMLElement | null = null;
	let _debounceTimer: number | null = null;

	// Simple deep clone
	function deepClone<T>(v: T): T {
		return JSON.parse(JSON.stringify(v));
	}

	// Editor update handler: debounced update of content and onChange callback
	function handleEditorUpdate() {
		if (!editor) return;
		const json = editor.getJSON();
		if (_debounceTimer) {
			clearTimeout(_debounceTimer);
			_debounceTimer = null;
		}
		_debounceTimer = window.setTimeout(() => {
			content = deepClone(json);
			if (typeof onChange === 'function') {
				try {
					onChange({ content });
				} catch {
					// swallow user callback errors
				}
			}
			_debounceTimer = null;
		}, debounce) as unknown as number;
	}

	// Keyboard handling: call callback props for Enter and Backspace
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (typeof onEnter === 'function') {
				try {
					onEnter({ event: e, selection: getCursor() });
				} catch {
					/* swallow */
				}
			}
		} else if (e.key === 'Backspace') {
			if (typeof onBackspace === 'function') {
				try {
					onBackspace({ event: e, selection: getCursor() });
				} catch {
					/* swallow */
				}
			}
		}
	}

	// Helpers to map between block/character offsets and ProseMirror absolute positions
	function _childTextLength(child: any) {
		if (!child) return 0;
		if (child.isText) return child.text ? child.text.length : 0;
		return 1; // treat non-text inline nodes as length 1
	}

	function computeAbsolutePosForBlockOffset(blockIndex: number, offset: number) {
		if (!editor) return 1;
		const doc = editor.state.doc;
		const numBlocks = doc ? doc.childCount : 0;
		let bi = Number(blockIndex);
		if (!Number.isFinite(bi) || bi < 0) bi = 0;
		bi = Math.min(bi, Math.max(0, numBlocks - 1));
		let ofs = Number(offset);
		if (!Number.isFinite(ofs) || ofs < 0) ofs = 0;
		let pos = 1;
		for (let i = 0; i < bi && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
		if (bi >= doc.childCount) return doc.content.size;
		const block = doc.child(bi);
		if (!block) return doc.content.size;
		let accum = 0;
		for (let j = 0; j < block.childCount; j++) {
			const child = block.child(j);
			const childLen = _childTextLength(child);
			if (accum + childLen >= ofs) {
				const within = Math.max(0, Math.min(childLen, ofs - accum));
				return pos + accum + within;
			}
			accum += childLen;
		}
		return pos + block.nodeSize - 1;
	}

	function computeBlockOffsetForAbsolutePos(absPos: number) {
		if (!editor) return { blockIndex: 0, offset: 0 };
		const doc = editor.state.doc;
		const pos = Math.max(1, Math.min(absPos, doc.content.size));
		let running = 1;
		for (let i = 0; i < doc.childCount; i++) {
			const block = doc.child(i);
			const blockStart = running;
			const blockEnd = running + block.nodeSize - 1;
			running += block.nodeSize;
			if (pos >= blockStart && pos <= blockEnd) {
				let accum = 0;
				let innerPos = pos - (blockStart + 1);
				if (innerPos < 0) innerPos = 0;
				for (let j = 0; j < block.childCount; j++) {
					const child = block.child(j);
					const childLen = _childTextLength(child);
					if (innerPos <= accum + (childLen - 1)) {
						const offsetInChild = innerPos - accum;
						return { blockIndex: i, offset: accum + Math.max(0, offsetInChild) };
					}
					accum += childLen;
				}
				return { blockIndex: i, offset: accum };
			}
		}
		return { blockIndex: Math.max(0, doc.childCount - 1), offset: 0 };
	}

	// Notify parent of selection changes
	function handleSelectionChange() {
		if (!editor) return;
		try {
			const sel = editor.state.selection;
			const cursor = { from: sel.from, to: sel.to, empty: sel.empty };
			const start = computeBlockOffsetForAbsolutePos(cursor.from);
			const end = computeBlockOffsetForAbsolutePos(cursor.to);
			const selectedText = sel.empty ? '' : editor.state.doc.textBetween(sel.from, sel.to, '\n');
			const payload = { selection: cursor, start, end, selectedText };
			if (typeof onSelectionChange === 'function') {
				try {
					onSelectionChange(payload);
				} catch {
					/* swallow */
				}
			}
		} catch {
			// ignore
		}
	}

	// Lifecycle: create TipTap editor with ProjectChip node
	onMount(() => {
		editor = new TipTapEditor({
			element: editorElement as HTMLElement,
			extensions: [
				StarterKit.configure({}),
				Bold,
				Underline,
				Link.configure({ openOnClick: true }),
				// use the ProjectChip node imported from nodes/ProjectChip.ts
				ProjectChip
			],
			content: deepClone(initial),
			editable,
			onUpdate: handleEditorUpdate,
			onCreate: handleEditorUpdate
		});

		const dom = (editor as any).view?.dom;
		if (dom) dom.addEventListener('keydown', handleKeydown);

		// Attempt to listen to TipTap/ProseMirror selection updates
		try {
			(editor as any).on && (editor as any).on('selectionUpdate', handleSelectionChange);
		} catch {
			// ignore
		}

		// Also listen to DOM selection events as a fallback
		const domSelHandler = () => handleSelectionChange();
		window.addEventListener('mouseup', domSelHandler);
		window.addEventListener('keyup', domSelHandler);
		window.addEventListener('selectionchange', domSelHandler);

		// Sync initial content back into bindable `content`
		content = initial;

		// emit initial selection state shortly after mount
		setTimeout(() => {
			handleSelectionChange();
		}, 0);

		return () => {
			if (editor) {
				const dom = (editor as any).view?.dom;
				if (dom) dom.removeEventListener('keydown', handleKeydown);
				try {
					(editor as any).off && (editor as any).off('selectionUpdate', handleSelectionChange);
				} catch {
					/* ignore */
				}
				window.removeEventListener('mouseup', domSelHandler);
				window.removeEventListener('keyup', domSelHandler);
				window.removeEventListener('selectionchange', domSelHandler);
				editor.destroy();
				editor = null;
			}
		};
	});

	onDestroy(() => {
		if (editor) {
			try {
				(editor as any).off && (editor as any).off('selectionUpdate');
			} catch {
				/* ignore */
			}
			editor.destroy();
			editor = null;
		}
	});

	// Keep editor content in sync when parent updates `content` externally.
	$effect(() => {
		if (!editor) return;
		try {
			const current = editor.getJSON();
			if (current && JSON.stringify(current) !== JSON.stringify(content)) {
				(editor.commands as any).setContent(current, false as any);
			}
		} catch {
			// ignore
		}
	});

	/**
	 * Exported imperative API
	 */

	export function focusEditor(position?: number | { blockIndex: number; offset: number }) {
		if (!editor) return;
		if (position !== undefined && position !== null) {
			try {
				setCursor(position as any);
			} catch {
				// ignore
			}
		}
		editor.commands.focus();
	}

	export function getCursor() {
		if (!editor) return null;
		const sel = editor.state.selection;
		const cursor = { from: sel.from, to: sel.to, empty: sel.empty };
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

	export function setCursor(position: number | { blockIndex: number; offset: number }) {
		if (!editor) return;
		const doc = editor.state.doc;
		let targetPos = 1;
		if (typeof position === 'number') {
			targetPos = computeAbsolutePosForBlockOffset(position, 0);
		} else {
			const { blockIndex, offset } = position;
			targetPos = computeAbsolutePosForBlockOffset(blockIndex, offset);
		}
		targetPos = Math.max(1, Math.min(targetPos, doc.content.size));
		try {
			(editor.commands as any).setTextSelection(targetPos as any);
		} catch {
			editor.commands.focus();
		}
		editor.commands.focus();
	}

	// Insert a project chip node at the current selection/caret
	export function insertProjectChip(projectId: string) {
		if (!editor) return false;
		try {
			(editor.commands as any).insertContent({ type: 'projectChip', attrs: { projectId } });
			return true;
		} catch {
			return false;
		}
	}

	// Pure helper wrappers
	export function mergeDocs(a: any, b: any) {
		return mergeDocuments(a, b);
	}

	export function splitDocAtPosition(
		doc: any,
		pos: number | { blockIndex: number; offset: number }
	) {
		return splitDocumentAt(doc, pos);
	}

	// Selection helpers
	export function isCursorAtStart() {
		if (!editor) return false;
		const sel = editor.state.selection;
		return sel.empty && sel.from <= 1;
	}

	export function isCursorAtEnd() {
		if (!editor) return false;
		const sel = editor.state.selection;
		const docSize = editor.state.doc.content.size;
		return sel.empty && sel.to >= docSize;
	}
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
