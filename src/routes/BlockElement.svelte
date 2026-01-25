<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import { DOMSerializer } from 'prosemirror-model';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		documentView,
		type RenderItem,
		updateBlock,
		createBlock,
		deleteBlock
	} from '$lib/stores/workspace';
	import { moveFocus } from '$lib/stores/ui';
	import { setCursor, splitFromCursor } from '$lib/utils/selection';
	import {
		registerEditor,
		unregisterEditor,
		focusEditorById,
		hasEditor
	} from '$lib/stores/editors';

	export let block: RenderItem;

	let element: HTMLElement | null = null;
	let editor: Editor | null = null;

	let content = '';
	let checked = false;

	// keep local reactive values in sync with store-provided block
	$: if (block && block.type === 'block') {
		// extract visible text from the ProseMirror JSON document for simple inline displays
		content = pmDocToText(block.content ?? null);
		checked = block.completed ?? false;
	}

	function formatDateLabel(date: Date) {
		const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
			date.getUTCDay()
		];
		const monthDay = date.getUTCMonth() + 1 + '/' + date.getUTCDate();
		return `${weekday} ${monthDay}`;
	}

	// Helper: convert a ProseMirror doc slice into HTML (kept for transient display only)
	function sliceToHTML(doc: any, from: number, to: number, schema: any) {
		const slice = doc.slice(from, to);
		const serializer = DOMSerializer.fromSchema(schema);
		const wrapper = document.createElement('div');
		wrapper.appendChild(serializer.serializeFragment(slice.content));
		return wrapper.innerHTML;
	}

	// Helper: convert a doc slice into a minimal ProseMirror JSON `doc` value.
	// We walk the slice content and call `toJSON()` on each child node to produce a valid doc.
	function sliceToJSON(doc: any, from: number, to: number) {
		try {
			const slice = doc.slice(from, to);
			const nodes: any[] = [];
			// Fragment.forEach exists on slice.content
			slice.content.forEach((node: any) => {
				// Each node is a ProseMirror Node and exposes toJSON()
				if (typeof node.toJSON === 'function') nodes.push(node.toJSON());
				else nodes.push(node as any);
			});
			return { type: 'doc', content: nodes };
		} catch {
			// Fallback: return an empty paragraph doc
			return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
		}
	}

	// Helper: create a minimal ProseMirror JSON doc containing the given plain text in a paragraph.
	function pmParagraphFromText(text: string) {
		return {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: text ? [{ type: 'text', text }] : []
				}
			]
		};
	}

	// Helper: extract visible plain text from a ProseMirror JSON doc (walks text nodes)
	function pmDocToText(doc: any) {
		if (!doc) return '';
		let out = '';
		function walk(node: any) {
			if (!node) return;
			if (node.type === 'text' && typeof node.text === 'string') {
				out += node.text;
			}
			if (Array.isArray(node.content)) {
				for (const child of node.content) walk(child);
			}
		}
		walk(doc);
		return out;
	}

	// compute visible text length from a PM doc (safe replacement for HTML-based length)
	function textLengthFromPMDoc(doc: any) {
		return pmDocToText(doc).length;
	}

	// Helper: append plain text into the last paragraph of a ProseMirror JSON doc.
	// If the doc is empty or missing, returns a paragraph doc with the text.
	// Preserves existing node structure; only mutates the last paragraph's text content.
	function appendTextToPMDoc(doc: any, textToAppend: string) {
		try {
			if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) {
				return pmParagraphFromText(textToAppend);
			}

			// Deep clone to avoid mutating original
			const newDoc = JSON.parse(JSON.stringify(doc));
			const content = newDoc.content as any[];

			// If there's no content, create a paragraph
			if (content.length === 0) {
				content.push({
					type: 'paragraph',
					content: textToAppend ? [{ type: 'text', text: textToAppend }] : []
				});
				return newDoc;
			}

			// Find last block node
			const lastNode = content[content.length - 1];

			// If last node is paragraph, try to append into its last text node
			if (lastNode.type === 'paragraph') {
				lastNode.content = lastNode.content ?? [];

				// If paragraph has no content, just push a text node
				if (lastNode.content.length === 0) {
					if (textToAppend) lastNode.content.push({ type: 'text', text: textToAppend });
					return newDoc;
				}

				// Otherwise, find the last child
				const lastChild = lastNode.content[lastNode.content.length - 1];
				if (lastChild && lastChild.type === 'text') {
					// Append into the last text node
					lastChild.text = (lastChild.text ?? '') + textToAppend;
				} else {
					// Append a new text node
					if (textToAppend) lastNode.content.push({ type: 'text', text: textToAppend });
				}
				return newDoc;
			}

			// If last node is not a paragraph, append a new paragraph node with the text
			if (textToAppend)
				content.push({ type: 'paragraph', content: [{ type: 'text', text: textToAppend }] });
			return newDoc;
		} catch {
			return pmParagraphFromText(textToAppend);
		}
	}

	// Helper: merge two ProseMirror JSON docs in a simple, safe way.
	// - If last node of left and first node of right are paragraphs, their contents are concatenated.
	// - Otherwise, nodes from right are appended after left's nodes.
	function mergePMDocs(leftDoc: any, rightDoc: any) {
		if (!leftDoc || !Array.isArray(leftDoc.content)) return rightDoc ?? pmParagraphFromText('');
		if (!rightDoc || !Array.isArray(rightDoc.content)) return leftDoc;

		const left = JSON.parse(JSON.stringify(leftDoc));
		const right = JSON.parse(JSON.stringify(rightDoc));
		const leftNodes = left.content as any[];
		const rightNodes = right.content as any[];

		if (leftNodes.length > 0 && rightNodes.length > 0) {
			const lastLeft = leftNodes[leftNodes.length - 1];
			const firstRight = rightNodes[0];
			// If both are paragraphs, merge their content arrays
			if (lastLeft.type === 'paragraph' && firstRight.type === 'paragraph') {
				lastLeft.content = lastLeft.content ?? [];
				firstRight.content = firstRight.content ?? [];
				lastLeft.content = lastLeft.content.concat(firstRight.content);
				// drop the first right node
				leftNodes.push(...rightNodes.slice(1));
				left.content = leftNodes;
				return left;
			}
		}

		// Fallback: append all right nodes to left
		left.content = leftNodes.concat(rightNodes);
		return left;
	}

	// Try to focus an item by id using the editors registry first, fallback to DOM
	async function focusItemByIdOrDOM(id: string, opts?: { at?: 'start' | 'end' | number }) {
		try {
			const focused = await focusEditorById(id, opts as any);
			if (focused) return true;
		} catch (err) {
			// ignore and fallback
		}

		const el = document.querySelector<HTMLElement>(`[data-id='${id}']`);
		if (!el) return false;
		try {
			el.focus();
		} catch {
			// ignore focus errors
		}

		const range = document.createRange();
		range.selectNodeContents(el);
		if (opts?.at === 'end') range.collapse(false);
		else range.collapse(true);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
		return true;
	}

	function setupKeyboard(node: HTMLElement) {
		const listener = async (e: KeyboardEvent) => {
			const [left, right] = splitFromCursor(node);

			if (!e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft') && block.index > 1) {
				if (left.length === 0) {
					e.preventDefault();
					moveFocus('up', $documentView, block.index);
				}
			} else if (!e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
				if (right.length === 0) {
					e.preventDefault();
					moveFocus('down', $documentView, block.index);
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (block.type !== 'block') return;
				// Store as ProseMirror JSON docs built from the plain-text parts
				updateBlock(block, { content: pmParagraphFromText(left) });
				createBlock({
					block_type: 'task',
					content: pmParagraphFromText(right),
					completed: false,
					date: block.date,
					id: 'new-' + Math.random().toString(36).substr(2, 9),
					agenda_order: (block as any).agenda_order + 1
				});
				await tick();
				moveFocus('down', $documentView, block.index);
			} else if (e.key === 'Backspace') {
				const [left, right] = splitFromCursor(node);

				// If the user currently has a non-collapsed selection, allow the browser/editor to handle it
				// (i.e. delete the selection) instead of treating this as a "delete block" operation.
				const sel = window.getSelection();
				if (sel && !sel.isCollapsed) return;

				if (left.length > 0) return;
				if (right.length > 0 && block.index === 1) return;
				e.preventDefault();

				// delete the block first, then wait for the document view to update
				deleteBlock(block.id);
				await tick();

				// Decide focus target after deletion
				if (block.index === 1) {
					moveFocus('down', $documentView, block.index - 1);
				} else {
					moveFocus('up', $documentView, block.index);
				}

				// If there's a previous block, merge the plain-text right side into it.
				const prevBlock = $documentView[block.index - 1];
				if (prevBlock && prevBlock.type === 'block') {
					// compute the visible-text-length of the previous block BEFORE we mutate it,
					// so we can place the caret at the original end after the merge.
					const originalPrevLen = textLengthFromPMDoc(prevBlock.content ?? null);
					// Append `right` (plain text) into the previous block's document
					const newPrevDoc = appendTextToPMDoc(prevBlock.content ?? pmParagraphFromText(''), right);
					updateBlock(prevBlock, { content: newPrevDoc });
					// If this block has a registered TipTap editor, prefer the registry to place the cursor.
					if (hasEditor(prevBlock.id)) {
						// focus and place cursor via the registered focus function (best-effort)
						try {
							// ask the editor registry to place the cursor at the original visible-text offset
							await focusEditorById(prevBlock.id, { atText: originalPrevLen } as any);
						} catch {
							// fallback to DOM-based cursor placement using the same visible-text offset
							const elem = document.querySelector<HTMLElement>(`[data-id='${prevBlock.id}']`);
							if (elem) await setCursor(elem, originalPrevLen);
						}
					} else {
						const elem = document.querySelector<HTMLElement>(`[data-id='${prevBlock.id}']`);
						if (elem) setCursor(elem, originalPrevLen);
					}
				}
			} else if (e.key === 'Tab') {
				e.preventDefault();
			}
		};

		node.addEventListener('keydown', listener);
		return {
			destroy() {
				node.removeEventListener('keydown', listener);
			}
		};
	}

	// Programmatic focus function for this editor
	// Accepts:
	// - opts.at: ProseMirror doc position or 'start' | 'end'
	// - opts.atText: a visible text-character offset (counts rendered characters)
	// If atText is provided we convert the visible text offset to a ProseMirror doc position.
	async function focusThisEditor(opts?: { at?: 'start' | 'end' | number; atText?: number }) {
		if (!editor) return;
		editor.commands.focus();
		await tick();
		try {
			// Direct doc-position based selection
			if (opts?.at === 'start') {
				editor.commands.setTextSelection(0);
			} else if (opts?.at === 'end') {
				const size = editor.state.doc.content.size;
				editor.commands.setTextSelection(Math.max(0, size - 1));
			} else if (typeof opts?.at === 'number') {
				editor.commands.setTextSelection(opts.at as number);
			} else if (typeof opts?.atText === 'number') {
				// Convert a visible text offset (counts rendered characters) into a ProseMirror doc position.
				let desired = Math.max(0, Math.floor(opts.atText));
				let targetPos: number | null = null;
				try {
					const doc = editor.state.doc;
					let accumulated = 0;
					doc.descendants((node, pos) => {
						if (targetPos !== null) return false; // stop walking
						if (node.isText) {
							const textLen = node.text ? node.text.length : 0;
							if (desired <= accumulated + textLen) {
								const offsetInNode = desired - accumulated;
								targetPos = pos + offsetInNode;
								return false; // stop walking
							}
							accumulated += textLen;
						}
						return true;
					});
				} catch {
					targetPos = null;
				}
				// If we couldn't find a mapping, place caret at the document end (safe fallback)
				if (targetPos === null) targetPos = Math.max(0, editor.state.doc.content.size - 1);
				editor.commands.setTextSelection(targetPos);
			}
		} catch {
			/* best-effort */
		}
	}

	// Keep TipTap content synced if the store changes (e.g. other components updated it)
	// Store keeps a ProseMirror-compatible JSON doc. Compare JSON-serialized forms and update editor
	// only when they differ to avoid loops.
	$: if (editor && block && block.type === 'block') {
		const stored = block.content ?? null;
		const current = editor.getJSON();
		try {
			if (JSON.stringify(stored) !== JSON.stringify(current)) {
				// Update editor content without emitting an update transaction to avoid loops
				editor.commands.setContent(stored as any, { emitUpdate: false });
			}
		} catch {
			// fallback: if setContent fails, ensure the editor shows something reasonable (visible text)
			const pm = element?.querySelector('.ProseMirror') as HTMLElement | null;
			if (pm && typeof stored === 'object') {
				pm.textContent = pmDocToText(stored);
			}
		}
	}

	onMount(() => {
		// Expose debug helper only in development to avoid TypeScript/production issues.
		// Use the `import.meta.env.DEV` flag supported by Vite/SvelteKit.
		if (
			typeof import.meta !== 'undefined' &&
			(import.meta as any).env &&
			(import.meta as any).env.DEV
		) {
			(window as any).getBlocks = () => {
				return $documentView;
			};
		}

		if (block?.type === 'block' && block.block_type === 'task') {
			editor = new Editor({
				element: element!,
				extensions: [StarterKit, Link.configure({ openOnClick: true })],
				// content is stored as ProseMirror JSON doc
				content: (block.content ?? null) as any,
				editorProps: {
					handleKeyDown(view, event) {
						const e = event as KeyboardEvent;
						if (!editor) return false;

						const sel = editor.state.selection;
						const doc = editor.state.doc;
						const schema = editor.state.schema;

						// Determine whether the cursor is at the start or end of the current inline parent.
						const atStart = sel.empty && sel.$from.parentOffset === 0;
						const atEnd = sel.empty && sel.$from.parentOffset === sel.$from.parent.content.size;

						// arrows: move between blocks when at edges
						if (!e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft') && block.index > 1) {
							if (atStart) {
								e.preventDefault();
								moveFocus('up', $documentView, block.index);
								return true;
							}
						}

						if (!e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
							if (atEnd) {
								e.preventDefault();
								moveFocus('down', $documentView, block.index);
								return true;
							}
						}

						// Enter: split the content into two tasks, preserving marks/structure by using JSON slices
						if (e.key === 'Enter') {
							e.preventDefault();
							if (block.type !== 'block') return false;

							const fromPos = sel.from;
							const leftJSON = sliceToJSON(doc, 0, fromPos);
							const rightJSON = sliceToJSON(doc, fromPos, doc.content.size);

							const nextBlock = $documentView[block.index + 1];
							// If we're at the end and the next block is a ghost, just move focus to it
							if (atEnd && nextBlock && nextBlock.type === 'ghost') {
								moveFocus('down', $documentView, block.index);
								return true;
							}

							// persist left JSON into current block and create a new block with right JSON
							updateBlock(block, { content: leftJSON });
							createBlock({
								block_type: 'task',
								content: rightJSON,
								completed: false,
								date: block.date,
								id: 'new-' + Math.random().toString(36).substr(2, 9),
								agenda_order: (block as any).agenda_order + 1
							});

							// after DOM updates, move focus to the new block
							tick().then(() => moveFocus('down', $documentView, block.index));
							return true;
						}

						// Backspace at start: delete/merge
						if (e.key === 'Backspace') {
							// If there's an active (non-collapsed) selection, let the editor handle it (delete the selection).
							if (!sel.empty) return false;

							// If the cursor is not at the absolute start of the inline parent, let the editor handle it
							if (!atStart) return false;

							// compute right JSON so we can append it to the previous block (preserve formatting)
							const fromPos = sel.from;
							const rightJSON = sliceToJSON(doc, fromPos, doc.content.size);

							// If there's content to the right and this is the first block, allow default behavior
							if (pmDocToText(rightJSON).trim().length > 0 && block.index === 1) return false;

							e.preventDefault();

							// capture previous block before we mutate/delete current block
							const prevBlock = $documentView[block.index - 1];
							// compute the visible-text length of the previous block BEFORE we mutate it,
							// so we can place the caret at that original end after the merge.
							const originalPrevLen =
								prevBlock && prevBlock.type === 'block'
									? textLengthFromPMDoc(prevBlock.content ?? null)
									: 0;

							// delete current block
							deleteBlock(block.id);

							// After DOM/store updates, merge the JSON docs in a way that avoids creating an extra paragraph
							tick().then(async () => {
								if (prevBlock && prevBlock.type === 'block') {
									try {
										// Merge previous block's doc with right JSON doc
										const merged = mergePMDocs(
											prevBlock.content ?? pmParagraphFromText(''),
											rightJSON
										);
										updateBlock(prevBlock, { content: merged });
									} catch {
										// On any error fallback to appending visible text from rightJSON
										const rightText = pmDocToText(rightJSON);
										const merged = appendTextToPMDoc(
											prevBlock.content ?? pmParagraphFromText(''),
											rightText
										);
										updateBlock(prevBlock, { content: merged });
									}

									await tick();
									// Give the browser a chance to paint and let ProseMirror map positions,
									// then yield one more microtask so the editor can reconcile. This reduces
									// selection-mapping errors when focusing programmatically.
									await new Promise((r) => requestAnimationFrame(() => r(undefined)));
									await tick();
									// Prefer programmatic focus/cursor placement for TipTap-backed blocks
									if (hasEditor(prevBlock.id)) {
										try {
											// Let the registered focus function position the cursor at the original visible-text end
											await focusEditorById(prevBlock.id, { atText: originalPrevLen } as any);
										} catch {
											// If registry focus fails, fallback to DOM selection + best-effort setCursor
											const el2 = document.querySelector<HTMLElement>(
												`[data-id='${prevBlock.id}']`
											);
											if (el2) {
												try {
													el2.focus();
												} catch {}
												const range2 = document.createRange();
												range2.selectNodeContents(el2);
												range2.collapse(false);
												const sel2 = window.getSelection();
												sel2?.removeAllRanges();
												sel2?.addRange(range2);
												// best-effort: set caret based on original visible-text length
												try {
													await setCursor(el2, originalPrevLen);
												} catch {}
											}
										}
									} else {
										// Non-TipTap blocks: set cursor by counting visible text characters
										const el2 = document.querySelector<HTMLElement>(`[data-id='${prevBlock.id}']`);
										if (el2) {
											try {
												await setCursor(el2, (el2.textContent ?? '').length);
											} catch {
												// best-effort fallback to DOM collapse
												try {
													el2.focus();
													const range2 = document.createRange();
													range2.selectNodeContents(el2);
													range2.collapse(false);
													const sel2 = window.getSelection();
													sel2?.removeAllRanges();
													sel2?.addRange(range2);
												} catch {}
											}
										}
									}
								} else {
									// If no previous block, focus the item that replaced this position
									const after = $documentView;
									const next = after[block.index];
									if (next) {
										try {
											const focused = await focusEditorById(next.id, { at: 'start' } as any);
											if (!focused) {
												const el3 = document.querySelector<HTMLElement>(`[data-id='${next.id}']`);
												if (el3) {
													try {
														el3.focus();
													} catch {}
													const range3 = document.createRange();
													range3.selectNodeContents(el3);
													range3.collapse(true);
													const sel3 = window.getSelection();
													sel3?.removeAllRanges();
													sel3?.addRange(range3);
												}
											}
										} catch {
											const el3 = document.querySelector<HTMLElement>(`[data-id='${next.id}']`);
											if (el3) {
												try {
													el3.focus();
												} catch {}
												const range3 = document.createRange();
												range3.selectNodeContents(el3);
												range3.collapse(true);
												const sel3 = window.getSelection();
												sel3?.removeAllRanges();
												sel3?.addRange(range3);
											}
										}
									}
								}
							});
							return true;
						}

						// prevent tab inside a single-line task
						if (e.key === 'Tab') {
							e.preventDefault();
							return true;
						}

						return false;
					}
				},
				onUpdate: ({ editor: ed }) => {
					// persist TipTap/ProseMirror JSON so the store keeps canonical document form
					updateBlock(block, { content: ed.getJSON() });
				}
			});

			// register editor focus function
			registerEditor(block.id, (opts) => focusThisEditor(opts as any));
		}
	});

	onDestroy(() => {
		if (block && block.type === 'block' && block.block_type === 'task') {
			unregisterEditor(block.id);
		}
		editor?.destroy();
	});
</script>

<div class="font-normal">
	{#if block.type === 'block'}
		{#if block.block_type === 'task'}
			<div class="group flex items-start gap-3 rounded-md px-2 py-1 hover:bg-white/5">
				<Checkbox bind:checked class="mt-1.25" />
				<div class="tiptap-block w-full" bind:this={element} data-id={block.id} use:setupKeyboard>
					<!-- TipTap mounts into `element` when block is a task (see onMount editor init) -->
				</div>
			</div>
		{:else if block.block_type === 'header'}
			<div class="mt-6 mb-1 flex gap-1 border-b pb-2">
				{formatDateLabel(new Date(block.date!))}
				<h2 class="text-sm text-muted" contenteditable="true">
					{content}
				</h2>
			</div>
		{:else}
			<div class="py-1">{content}</div>
		{/if}
	{:else if block.type === 'overdue'}
		<div class="mt-6">
			<h2
				class="mb-1 scroll-m-20 border-b pb-2 text-base font-semibold tracking-tight text-red-500 transition-colors first:mt-0"
			>
				Overdue
			</h2>
		</div>
	{:else if block.type === 'ghost'}
		<div class="group flex items-start gap-3 rounded-md px-2 py-1 hover:bg-white/5">
			<Checkbox disabled class="mt-1.25" />

			<div
				role="textbox"
				tabindex="0"
				contenteditable="true"
				use:setupKeyboard
				data-id={block.id}
				oninput={async (e: Event) => {
					const target = e.target as HTMLDivElement;
					// get previous block in agenda order
					const prevBlock = $documentView[block.index - 1];
					if (prevBlock.type !== 'block') {
						target.innerText = '';
						return;
					}
					createBlock({
						block_type: 'task',
						content: target.innerText,
						completed: false,
						date: block?.date,
						id: 'new-' + Math.random().toString(36).substr(2, 9),
						agenda_order: prevBlock.agenda_order + 1
					});
					// move focus to the new block
					await tick();
					moveFocus('up', $documentView, block.index);

					target.innerText = '';
				}}
				class="ghost-box flex-1 leading-relaxed wrap-anywhere outline-none"
			></div>
		</div>
	{/if}
</div>

<style>
	:global(.tiptap-block .ProseMirror) {
		outline: none;
		font-size: 0.95rem;
		line-height: 1rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipses;
	}
	:global(.task-row),
	:global(.task-row:focus),
	:global(.task-row:focus-within),
	:global(.group:focus),
	:global(.group:focus-within) {
		outline: none;
	}
	.tiptap-block {
		padding-top: 0.125rem;
		padding-bottom: 0.125rem;
	}
</style>
