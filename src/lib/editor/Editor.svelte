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
	 *   - onChange, onEnter, onBackspace, onSelectionChange: Event callbacks
	 *
	 * API:
	 *   - focusEditor, setCursor, getCursor
	 *   - insertProjectChip
	 *   - mergeDocs, splitDocAtPosition
	 *   - isCursorAtStart, isCursorAtEnd
	 */

	import { onMount, onDestroy } from 'svelte';
	import { Editor as TipTapEditor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Bold from '@tiptap/extension-bold';
	import Underline from '@tiptap/extension-underline';
	import ProjectChip, { resolveLabel } from './nodes/ProjectChip';
	import { mergeDocuments, splitDocumentAt } from './tools';

	// ============================================================================
	// Props & State
	// ============================================================================

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

	let editor: TipTapEditor | null = null;
	let editorElement: HTMLElement | null = null;
	let _debounceTimer: number | null = null;

	// ============================================================================
	// Utility Functions
	// ============================================================================

	function deepClone<T>(v: T): T {
		return JSON.parse(JSON.stringify(v));
	}

	function _childTextLength(child: any): number {
		if (!child) return 0;
		if (child.isText) return child.text ? child.text.length : 0;
		return 1; // Non-text inline nodes count as 1
	}

	// ============================================================================
	// Position Conversion (ProseMirror ↔ BlockIndex/Offset)
	// ============================================================================

	/**
	 * Convert {blockIndex, offset} to ProseMirror absolute position.
	 * ProseMirror uses 1-based positions where position 1 is start of first block.
	 */
	function computeAbsolutePosForBlockOffset(blockIndex: number, offset: number): number {
		if (!editor) return 1;
		const doc = editor.state.doc;
		const numBlocks = doc.childCount;

		// Clamp block index to valid range
		let bi = Math.max(0, Math.min(blockIndex, numBlocks - 1));
		let ofs = Math.max(0, offset);

		// Calculate position by summing sizes of blocks before target
		let pos = 1;
		for (let i = 0; i < bi && i < numBlocks; i++) {
			pos += doc.child(i).nodeSize;
		}

		if (bi >= numBlocks) return doc.content.size;

		const block = doc.child(bi);
		if (!block) return doc.content.size;

		// Find offset within block's inline content
		let accum = 0;
		for (let j = 0; j < block.childCount; j++) {
			const child = block.child(j);
			const childLen = _childTextLength(child);
			if (accum + childLen >= ofs) {
				return pos + accum + Math.max(0, Math.min(childLen, ofs - accum));
			}
			accum += childLen;
		}

		return pos + block.nodeSize - 1;
	}

	/**
	 * Convert ProseMirror absolute position to {blockIndex, offset}.
	 * Returns the block index and character offset within that block's content.
	 */
	function computeBlockOffsetForAbsolutePos(absPos: number): { blockIndex: number; offset: number } {
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
				let innerPos = Math.max(0, pos - blockStart - 1);

				for (let j = 0; j < block.childCount; j++) {
					const child = block.child(j);
					const childLen = _childTextLength(child);
					if (innerPos <= accum + childLen - 1) {
						return { blockIndex: i, offset: accum + Math.max(0, innerPos - accum) };
					}
					accum += childLen;
				}

				return { blockIndex: i, offset: accum };
			}
		}

		return { blockIndex: Math.max(0, doc.childCount - 1), offset: 0 };
	}

	/**
	 * Extract selected text, including custom node labels (e.g., ProjectChip → "#AP Gov").
	 * Walks through the selection range and renders each node appropriately.
	 */
	function getSelectedTextWithCustomNodes(from: number, to: number): string {
		if (!editor) return '';
		const doc = editor.state.doc;
		let result = '';

		doc.nodesBetween(from, to, (node: any, pos: number) => {
			if (node.isText) {
				// Extract the portion of text within selection bounds
				const nodeFrom = Math.max(from, pos);
				const nodeTo = Math.min(to, pos + node.nodeSize);
				if (nodeTo > nodeFrom) {
					result += node.text?.slice(nodeFrom - pos, nodeTo - pos) ?? '';
				}
			} else if (node.type.name === 'projectChip' && pos >= from && pos < to) {
				// Render ProjectChip using its label resolver
				const projectId = node.attrs?.projectId ?? null;
				const projectName = node.attrs?.projectName ?? null;
				result += resolveLabel(projectId, projectName);
			}
		});

		return result;
	}

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
				onEnter({ event: e, selection: getCursor() });
			} catch {
				// Swallow callback errors
			}
		} else if (e.key === 'Backspace' && typeof onBackspace === 'function') {
			try {
				onBackspace({ event: e, selection: getCursor() });
			} catch {
				// Swallow callback errors
			}
		}
	}

	function handleSelectionChange() {
		if (!editor) return;
		try {
			const payload = getCursor();
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
				StarterKit.configure({}),
				Bold,
				Underline,
				Link.configure({ openOnClick: true }),
				ProjectChip
			],
			content: deepClone(initial),
			editable,
			onUpdate: handleEditorUpdate,
			onCreate: handleEditorUpdate
		});

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
	 * Focus the editor, optionally positioning cursor at specified location.
	 * @param position - Absolute position (number) or {blockIndex, offset}
	 */
	export function focusEditor(position?: number | { blockIndex: number; offset: number }) {
		if (!editor) return;
		if (position !== undefined && position !== null) {
			try {
				setCursor(position as any);
			} catch {
				// Ignore
			}
		}
		editor.commands.focus();
	}

	/**
	 * Get current cursor/selection information.
	 * Returns: { selection, start, end, selectedText }
	 * - selection: { from, to, empty } (0-based positions)
	 * - start/end: { blockIndex, offset }
	 * - selectedText: String including custom node labels
	 */
	export function getCursor() {
		if (!editor) return null;
		const sel = editor.state.selection;

		// Convert from ProseMirror 1-based to 0-based positions
		const selection = { from: sel.from - 1, to: sel.to - 1, empty: sel.empty };
		const start = computeBlockOffsetForAbsolutePos(sel.from);
		const end = computeBlockOffsetForAbsolutePos(sel.to);
		const selectedText = sel.empty ? '' : getSelectedTextWithCustomNodes(sel.from, sel.to);

		return { selection, start, end, selectedText };
	}

	/**
	 * Set cursor position.
	 * @param position - Absolute position (number) or {blockIndex, offset}
	 */
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
			(editor.commands as any).setTextSelection(targetPos);
		} catch {
			// Fallback to just focusing
		}

		editor.commands.focus();
	}

	/**
	 * Insert a ProjectChip node at current cursor position.
	 * @param projectId - ID of the project
	 * @returns true if successful
	 */
	export function insertProjectChip(projectId: string): boolean {
		if (!editor) return false;
		try {
			(editor.commands as any).insertContent({ type: 'projectChip', attrs: { projectId } });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Merge two documents (delegates to tools.ts).
	 */
	export function mergeDocs(a: any, b: any) {
		return mergeDocuments(a, b);
	}

	/**
	 * Split document at position (delegates to tools.ts).
	 */
	export function splitDocAtPosition(doc: any, pos: number | { blockIndex: number; offset: number }) {
		return splitDocumentAt(doc, pos);
	}

	/**
	 * Check if cursor is at the start of the document.
	 */
	export function isCursorAtStart(): boolean {
		if (!editor) return false;
		const sel = editor.state.selection;
		return sel.empty && sel.from <= 1;
	}

	/**
	 * Check if cursor is at the end of the document.
	 */
	export function isCursorAtEnd(): boolean {
		if (!editor) return false;
		const sel = editor.state.selection;
		return sel.empty && sel.to >= editor.state.doc.content.size;
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
