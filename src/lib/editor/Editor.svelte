<script lang="ts">
	/**
	 * TipTap Editor component (Svelte 5 runes style)
	 *
	 * Overview
	 * - A small wrapper around TipTap (ProseMirror) that provides:
	 *   - bindable JSON `content` (using Svelte 5 `$bindable`)
	 *   - debounced onChange callbacks
	 *   - selection change notifications with both absolute and block/offset coordinates
	 *   - a tiny inline `atomic` node so demos can insert non-text atoms
	 *   - a compact imperative API exported from the component instance
	 *
	 * Props / Bindings
	 * - `initial` (object) : initial TipTap/ProseMirror JSON document. Used to initialize `content`.
	 * - `content` (bindable) : the current document JSON. Parent components can `bind:content` to keep state in sync.
	 * - `editable` (boolean) : whether the editor is editable.
	 * - `debounce` (number) : debounce time in ms for calling `onChange` and updating `content`.
	 *
	 * Callback props (Svelte 5 runes-style)
	 * - `onChange(payload)` :
	 *     - payload: { content } — called after debounced updates when the editor document changes.
	 * - `onEnter(payload)` :
	 *     - payload: { event, selection } — called when Enter is pressed. `selection` is the same shape as getCursor().
	 * - `onBackspace(payload)` :
	 *     - payload: { event, selection } — called when Backspace is pressed.
	 * - `onSelectionChange(payload)` :
	 *     - payload: {
	 *         selection: { from, to, empty },           // absolute ProseMirror positions
	 *         start: { blockIndex, offset },            // selection start as block+char-offset (zero-based)
	 *         end: { blockIndex, offset },              // selection end as block+char-offset (zero-based)
	 *         selectedText: string
	 *       }
	 *
	 * Notes about block/offset:
	 * - `blockIndex` is the zero-based index of the top-level block node (e.g. paragraph).
	 * - `offset` is a zero-based character offset within that block:
	 *     - offset = 0 => before the first character of the block
	 *     - offset = N => after N characters from the block start (i.e., position before character index N)
	 * - Inline formatted text (bold, link, etc.) is counted by actual character length; non-text inline nodes (e.g. atomic) count as length 1.
	 *
	 * Exported Imperative API (exported functions on the component instance)
	 * - `focusEditor(position?)` :
	 *     - focus the editor. Optionally pass a position to set the cursor before focusing.
	 *     - position can be numeric (interpreted as blockIndex) or { blockIndex, offset }.
	 * - `setCursor(position)` :
	 *     - programmatically place the caret using { blockIndex, offset } (or a numeric blockIndex).
	 *     - uses character-based offsets (not ProseMirror's nodeSize) so offsets match visible characters.
	 * - `getCursor()` :
	 *     - returns { from, to, empty, start, end } where start/end are { blockIndex, offset }.
	 * - `getSelectedText()` : returns plain selected text, or '' if empty.
	 * - `mergeDocs(a, b)` and `splitDocAtPosition(doc, pos)` : thin wrappers over the pure helpers in ./tools.
	 *
	 * Implementation notes
	 * - The editor uses a small `Atomic` inline node so demos can embed non-text atoms into the JSON.
	 * - Selection updates are emitted via `onSelectionChange` and also available through `getCursor()`.
	 * - The component tries to listen for TipTap/ProseMirror `selectionUpdate` events if available, and also emits an initial selection state on mount.
	 *
	 * Requirements
	 * - This file expects TipTap packages to be installed: @tiptap/core, @tiptap/starter-kit, @tiptap/extension-link,
	 *   @tiptap/extension-bold, @tiptap/extension-underline (or equivalents).
	 */

	import { onMount, onDestroy } from 'svelte';
	import { Editor as TipTapEditor, Node as TipTapNode } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Bold from '@tiptap/extension-bold';
	import Underline from '@tiptap/extension-underline';
	import { mergeDocuments, splitDocumentAt } from './tools';
	import { getProjectName, projects } from '$lib/stores/projects';

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
	let _projectsUnsub: (() => void) | null = null;

	// Simple deep clone helper
	function deepClone<T>(v: T): T {
		return JSON.parse(JSON.stringify(v));
	}

	// Hydrate atomic project chips in the editor DOM by looking up project names.
	// Moved to top-level so it can be called from multiple places (mount, updates, setContent).
	function hydrateProjectChips() {
		try {
			if (!editor) return;
			const dom = (editor as any).view?.dom;
			if (!dom) return;
			const chips = dom.querySelectorAll('span[data-atomic]');
			chips.forEach((el: Element) => {
				try {
					const projectId =
						(el as HTMLElement).getAttribute('data-project-id') ||
						(el as HTMLElement).getAttribute('data-atomic-id') ||
						el.getAttribute('data-id') ||
						null;
					const name = projectId ? getProjectName(projectId) : null;
					(el as HTMLElement).setAttribute('data-name', name || '');
					if (name) {
						(el as HTMLElement).textContent = `#${name}`;
					} else if (projectId) {
						(el as HTMLElement).textContent = `#${projectId}`;
					} else {
						(el as HTMLElement).textContent = '#Project';
					}
					(el as HTMLElement).classList.add('project-chip');
				} catch {
					// ignore per-chip errors
				}
			});
		} catch {
			// ignore hydration errors
		}
	}

	// Minimal inline atomic node so JSON can contain atomic nodes (project chips)
	// - Supports attrs: id, projectId, data
	// - Renders a span with data attributes so the component can hydrate the display text
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
				projectId: { default: null },
				data: { default: null },
				name: { default: '' }
			};
		},
		parseHTML() {
			// match the atomic span in the DOM
			return [{ tag: 'span[data-atomic]' }];
		},
		renderText({ node }) {
			return node.attrs?.name || '#Project';
		},
		renderHTML({ HTMLAttributes }: any) {
			// include both data-atomic-id and data-project-id so stored JSON can use either
			const attrs: Record<string, any> = {
				'data-atomic': 'true',
				class: 'project-chip',
				...HTMLAttributes
			};
			if (HTMLAttributes.id) attrs['data-atomic-id'] = HTMLAttributes.id;
			if (HTMLAttributes.projectId) attrs['data-project-id'] = HTMLAttributes.projectId;

			// Render a sensible label immediately from attrs so the chip is visible
			// even before any hydration/NodeView runs. Prefer a human-readable projectId if present.
			let label = '#Project';
			try {
				if (HTMLAttributes.projectId) label = `#${HTMLAttributes.projectId}`;
				else if (HTMLAttributes.id) label = `#${HTMLAttributes.id}`;
			} catch {
				// ignore and fall back to generic label
			}

			return ['span', attrs, label];
		},
		// Provide a NodeView so TipTap renders a DOM chip synchronously from node attrs.projectId
		addNodeView() {
			return ({ node }) => {
				const projectId = node.attrs?.projectId ?? node.attrs?.id ?? null;
				const span = document.createElement('span');
				span.setAttribute('data-atomic', 'true');
				span.setAttribute('draggable', 'false');
				if (projectId) span.setAttribute('data-project-id', String(projectId));
				span.className = 'project-chip';

				// Resolve project name synchronously from the store helper
				try {
					const name = getProjectName(projectId);
					if (name) span.textContent = `#${name}`;
					else if (projectId) span.textContent = `#${projectId}`;
					else span.textContent = '#Project';
				} catch {
					span.textContent = projectId ? `#${projectId}` : '#Project';
				}

				return {
					dom: span,
					// update when the node's attrs change (e.g. projectId updated)
					update(updatedNode: any) {
						try {
							const newId = updatedNode.attrs?.projectId ?? updatedNode.attrs?.id ?? null;
							if (newId) span.setAttribute('data-project-id', String(newId));
							else span.removeAttribute('data-project-id');
							const newName = getProjectName(newId);
							if (newName) span.textContent = `#${newName}`;
							else if (newId) span.textContent = `#${newId}`;
							else span.textContent = '#Project';
						} catch {
							// ignore update errors
						}
						return true;
					}
				};
			};
		}
	});

	// Called by TipTap on update; debounce and assign to bindable `content`
	function handleEditorUpdate() {
		if (!editor) return;
		hydrateProjectChips();
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
			// hydrate atomic project chips after updating content (run on next tick)
			try {
				setTimeout(() => hydrateProjectChips(), 0);
			} catch (e) {}
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
		// sanitize inputs to avoid undefined/NaN and out-of-range indices
		const numBlocks = doc ? doc.childCount : 0;
		let bi = Number(blockIndex);
		if (!Number.isFinite(bi) || bi < 0) bi = 0;
		// clamp block index to valid range
		bi = Math.min(bi, Math.max(0, numBlocks - 1));
		let ofs = Number(offset);
		if (!Number.isFinite(ofs) || ofs < 0) ofs = 0;
		let pos = 1; // absolute position of the first content position in the doc
		// add sizes of preceding blocks
		for (let i = 0; i < bi && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
		if (bi >= doc.childCount) return doc.content.size;
		const block = doc.child(bi);
		if (!block) return doc.content.size;
		// accumulate character counts across inline children
		let accum = 0;
		for (let j = 0; j < block.childCount; j++) {
			const child = block.child(j);
			const childLen = _childTextLength(child);
			// If the desired offset falls within this child, compute within-child position
			if (accum + childLen >= ofs) {
				const within = Math.max(0, Math.min(childLen, ofs - accum));
				// absolute position: block start (pos) + accum + within
				return pos + accum + within;
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

		// subscribe to projects store so we can re-hydrate chips when project data changes
		try {
			_projectsUnsub = projects.subscribe(() => {
				// schedule a hydrate on next tick to allow the editor DOM to be stable
				setTimeout(() => hydrateProjectChips(), 0);
			});
		} catch {
			_projectsUnsub = null;
		}

		// sync initial into bindable content (parent may not be bound yet)
		content = deepClone(initial);

		// hydrate atomic project chips in the editor DOM by looking up project names
		function hydrateProjectChips() {
			try {
				if (!editor) return;
				const dom = (editor as any).view?.dom;
				if (!dom) return;
				const chips = dom.querySelectorAll('span[data-atomic]');
				chips.forEach((el: Element) => {
					try {
						const projectId =
							(el as HTMLElement).getAttribute('data-project-id') ||
							(el as HTMLElement).getAttribute('data-atomic-id') ||
							el.getAttribute('data-id') ||
							null;
						const name = projectId ? getProjectName(projectId) : null;
						(el as HTMLElement).setAttribute('data-name', name || '');
						if (name) {
							(el as HTMLElement).textContent = `#${name}`;
						} else if (projectId) {
							(el as HTMLElement).textContent = `#${projectId}`;
						} else {
							(el as HTMLElement).textContent = '#Project';
						}
						(el as HTMLElement).classList.add('project-chip');
					} catch {
						// ignore per-chip errors
					}
				});
			} catch {
				// ignore hydration errors
			}
		}

		// fire an initial selection update so parent can reflect initial cursor state
		// and hydrate atomic chips inside the editor DOM
		setTimeout(() => {
			handleSelectionChange();
			hydrateProjectChips();
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
				window.removeEventListener('mouseup', _domSelHandler);
				window.removeEventListener('keyup', _domSelHandler);
				// unsubscribe from projects store
				try {
					_projectsUnsub && _projectsUnsub();
				} catch {
					/* ignore */
				}
				_projectsUnsub = null;
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
			// unsubscribe from projects store if still subscribed
			try {
				_projectsUnsub && _projectsUnsub();
			} catch {
				/* ignore */
			}
			_projectsUnsub = null;
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
				// hydrate atomic project chips when parent sets content programmatically
				try {
					setTimeout(() => hydrateProjectChips(), 0);
				} catch (e) {}
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
	export function insertProjectChip(projectId: string) {
		// Inserts an atomic project chip at the current selection/caret.
		// Returns true if insertion appears to have been dispatched.
		if (!editor) return false;
		try {
			const id = projectId;
			// TipTap command to insert inline node. Compatibility: cast to any.
			(editor.commands as any).insertContent({ type: 'atomic', attrs: { projectId: id } });
			// hydrate chips after insertion
			try {
				setTimeout(() => hydrateProjectChips(), 0);
			} catch {}
			return true;
		} catch {
			return false;
		}
	}

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
	/**
	 * Return true if the current selection is a collapsed cursor at the start of the document.
	 */
	export function isCursorAtStart() {
		if (!editor) return false;
		const sel = editor.state.selection;
		// ProseMirror document start is position 1; require collapsed selection at/before start
		return sel.empty && sel.from <= 1;
	}

	/**
	 * Return true if the current selection is a collapsed cursor at the end of the document.
	 */
	export function isCursorAtEnd() {
		if (!editor) return false;
		const sel = editor.state.selection;
		const docSize = editor.state.doc.content.size;
		// Collapsed selection at or beyond end position
		return sel.empty && sel.to >= docSize;
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

	:global(.project-chip[data-project-id='']) {
		@apply opacity-80;
	}

	:global(.tiptap) {
		outline: none;
	}
</style>
