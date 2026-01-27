<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Editor from '$lib/editor/Editor.svelte';
	import { mergeDocuments, splitDocumentAt } from '$lib/editor/tools';

	// Svelte 5 runes: reactive state proxies
	let contentA = $state<any>({
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'Hello ' },
					{ type: 'projectChip', attrs: { projectId: '43987466557' } },
					{ type: 'text', text: ' Bold', marks: [{ type: 'bold' }] },
					{ type: 'text', text: ' world. ' },
					{
						type: 'text',
						text: 'Link',
						marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
					}
				]
			}
		]
	});

	let contentB = $state<any>({
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'Second editor — ' },
					{ type: 'text', text: 'more text', marks: [{ type: 'bold' }] }
				]
			}
		]
	});

	// merged editor content
	let mergedContent = $state<any>({ type: 'doc', content: [] });

	let blockIndex = $state(0);
	let offset = $state(0);

	// editor instance refs (bind:this returns exports in Svelte 5)
	let editorA: any;
	let editorB: any;
	let editorMerged: any;

	// Selection / cursor info from editor A (make reactive)
	let selInfo = $state<any>(null);

	// ---- Merge / Split helpers ----

	// Merge helpers (call pure merge function)
	function mergeAToB() {
		const merged = mergeDocuments(contentA, contentB);
		contentB = merged;
	}

	function mergeBToA() {
		const merged = mergeDocuments(contentB, contentA);
		contentA = merged;
	}

	// Merge A and B into the merged editor area
	function mergeIntoMerged() {
		mergedContent = mergeDocuments(contentA, contentB);
	}

	// Replace Editor A with merged content (useful to "merge back into one editor")
	function replaceAWithMerged() {
		if (!mergedContent) return;
		contentA = JSON.parse(JSON.stringify(mergedContent));
		// clear B to show single-editor scenario
		contentB = { type: 'doc', content: [] };
	}

	// Split editor A at specified blockIndex + offset
	function splitA() {
		const res = splitDocumentAt(contentA, {
			blockIndex: Number(blockIndex),
			offset: Number(offset)
		});
		if (res && 'left' in res && 'right' in res) {
			contentA = res.left;
			contentB = res.right;
		}
	}

	// Append an atomic inline node to last block of A
	function appendAtomicToA() {
		// create a new clone and assign - avoids ownership warnings
		const clone = JSON.parse(JSON.stringify(contentA || { type: 'doc', content: [] }));
		if (!Array.isArray(clone.content) || clone.content.length === 0) {
			clone.content = [{ type: 'paragraph', content: [] }];
		}
		const last = clone.content[clone.content.length - 1];
		if (!Array.isArray(last.content)) last.content = [];
		last.content.push({
			type: 'atomic',
			attrs: { id: `atom-${Date.now()}`, data: 'ATOMIC' }
		});
		contentA = clone;
	}

	function splitAAtFirstWord() {
		const res = splitDocumentAt(contentA, { blockIndex: 0, offset: 5 });
		if (res && 'left' in res && 'right' in res) {
			contentA = res.left;
			contentB = res.right;
		}
	}

	// ---- Selection / cursor info handling ----

	// Update selection info from editorA in a JSON-friendly way.
	function updateSelInfo() {
		// Ensure editorA exists and exports the helpers
		if (!editorA) {
			selInfo = null;
			return;
		}
		try {
			const cursor = editorA.getCursor?.();
			const selectedText = editorA.getSelectedText?.();
			// Create a plain serializable object (avoid passing editor internals)
			const info = {
				cursor: cursor ? { from: cursor.from, to: cursor.to, empty: cursor.empty } : null,
				selectedText: typeof selectedText === 'string' ? selectedText : ''
			};
			// assign a deep clone so Svelte's proxy notices changes reliably
			selInfo = JSON.parse(JSON.stringify(info));
		} catch (e) {
			// if anything fails, set to null to avoid stale references
			selInfo = null;
		}
	}

	// Place cursor at a block/offset in editor A and focus it
	function placeCursorA() {
		editorA?.setCursor?.({ blockIndex: 0, offset: 0 });
		editorA?.focusEditor?.();
		// update selection info right after moving the cursor
		setTimeout(updateSelInfo, 50);
	}

	// Place cursor at the blockIndex/offset inputs and focus editor A
	function placeCursorAtBlockOffset() {
		const pos = { blockIndex: Number(blockIndex), offset: Number(offset) };
		// Editor's focusEditor accepts an optional position and will call setCursor internally
		if (editorA?.focusEditor) {
			editorA.focusEditor(pos);
		} else if (editorA?.setCursor) {
			editorA.setCursor(pos);
			editorA?.focusEditor?.();
		}
		// update selection info shortly after moving the cursor
		setTimeout(updateSelInfo, 80);
	}

	// Optional callback props for editors (Svelte5-style callback props)
	function handleEnterA(payload: any) {
		// example: just log or update something
		console.log('Editor A enter', payload);
	}

	function handleBackspaceA(payload: any) {
		console.log('Editor A backspace', payload);
	}

	function handleChangeA({ content }: any) {
		// content is provided by the editor's onChange callback; keep state in sync
		if (content) contentA = content;
		// selection could have changed as a consequence of edits
		updateSelInfo();
	}

	// Selection-change callback from Editor A (uses Editor.svelte's onSelectionChange prop)
	function handleSelectionChangeA(payload: any) {
		// payload = { selection: { from, to, empty }, selectedText }
		try {
			// keep a plain serializable copy so Svelte's $state updates reliably
			selInfo = JSON.parse(JSON.stringify(payload));
		} catch (e) {
			selInfo = payload;
		}
	}

	function handleChangeB({ content }: any) {
		if (content) contentB = content;
	}

	// Keep selection info in sync with user interactions.
	// We'll listen to a few DOM events and poll briefly while the page is active.
	let _selPollTimer: number | null = null;
	let _pollInterval = 500;

	onMount(() => {
		// update once on mount
		updateSelInfo();

		// key/mouse events can change selection inside the editor
		const onUserActivity = () => {
			// schedule a quick update
			updateSelInfo();
			// also start a short-lived poll to catch rapid changes (like drag-selection)
			if (_selPollTimer) {
				clearInterval(_selPollTimer);
				_selPollTimer = null;
			}
			_selPollTimer = window.setInterval(() => {
				updateSelInfo();
			}, 200) as unknown as number;

			// stop polling after a short while
			setTimeout(() => {
				if (_selPollTimer) {
					clearInterval(_selPollTimer);
					_selPollTimer = null;
				}
			}, 1200);
		};

		window.addEventListener('mouseup', onUserActivity);
		window.addEventListener('keyup', onUserActivity);
		window.addEventListener('selectionchange', onUserActivity);

		return () => {
			window.removeEventListener('mouseup', onUserActivity);
			window.removeEventListener('keyup', onUserActivity);
			window.removeEventListener('selectionchange', onUserActivity);
			if (_selPollTimer) {
				clearInterval(_selPollTimer);
				_selPollTimer = null;
			}
		};
	});

	onDestroy(() => {
		if (_selPollTimer) {
			clearInterval(_selPollTimer);
			_selPollTimer = null;
		}
	});

	// Helper to programmatically import merged content into editor A (alias)
	function importMergedToA() {
		if (!mergedContent) return;
		contentA = JSON.parse(JSON.stringify(mergedContent));
	}

	// A small helper to focus merged editor
	function focusMerged() {
		editorMerged?.focusEditor?.();
	}
</script>

<h1>TipTap Editor Demo — Merge / Split / Atomic (Svelte 5)</h1>

<div class="container">
	<div class="col">
		<h3>Editor A</h3>
		<!-- bindable content prop: child uses $bindable so parent can bind:content -->
		<Editor
			bind:this={editorA}
			bind:content={contentA}
			initial={contentA}
			debounce={200}
			onChange={handleChangeA}
			onEnter={handleEnterA}
			onBackspace={handleBackspaceA}
			onSelectionChange={handleSelectionChangeA}
		/>
		<div class="controls">
			<button onclick={appendAtomicToA}>Append Atomic to A</button>
			<button onclick={splitAAtFirstWord}>Split A at offset 5</button>
			<button onclick={() => editorA?.focusEditor?.()}>Focus A</button>
			<button onclick={placeCursorA}>Place Cursor at start A</button>
			<button
				onclick={() =>
					editorA?.focusEditor?.({ blockIndex: Number(blockIndex), offset: Number(offset) })}
				>Place Cursor at block/offset</button
			>
			<button onclick={updateSelInfo}>Get Selection A</button>
			<!-- Demo helper: insert a ProjectChip node at the caret in Editor A -->
			<button onclick={() => editorA?.insertProjectChip?.('43987466557')}
				>Insert Project Chip (43987466557)</button
			>
		</div>

		<div style="margin-top:8px;">
			<div class="small">Editor A JSON</div>
			<pre class="json">{JSON.stringify(contentA, null, 2)}</pre>
		</div>
	</div>

	<div class="col">
		<h3>Editor B</h3>
		<Editor
			bind:this={editorB}
			initial={contentB}
			bind:content={contentB}
			debounce={200}
			onChange={handleChangeB}
		/>
		<div class="controls">
			<button onclick={mergeAToB}>Merge A → B</button>
			<button onclick={mergeBToA}>Merge B → A</button>
			<button onclick={() => editorB?.focusEditor?.()}>Focus B</button>
		</div>

		<div style="margin-top:8px;">
			<div class="small">Editor B JSON</div>
			<pre class="json">{JSON.stringify(contentB, null, 2)}</pre>
		</div>
	</div>
</div>

<!-- New merged-editor section -->
<div class="merged-section">
	<h3>Merged Editor (A + B)</h3>
	<div class="merged-controls">
		<button onclick={mergeIntoMerged}>Create Merged A+B</button>
		<button onclick={replaceAWithMerged}>Replace A with Merged (clear B)</button>
		<button onclick={importMergedToA}>Import Merged into A</button>
		<button onclick={focusMerged}>Focus Merged</button>
	</div>

	<Editor
		bind:this={editorMerged}
		bind:content={mergedContent}
		initial={mergedContent}
		debounce={200}
		onChange={({ content }) => (mergedContent = content)}
	/>

	<div style="margin-top:8px;">
		<div class="small">Merged JSON</div>
		<pre class="json">{JSON.stringify(mergedContent, null, 2)}</pre>
	</div>
</div>

<div class="split-controls">
	<h4>Split controls (operate on Editor A)</h4>
	<label
		>Block index:
		<input type="number" bind:value={blockIndex} min="0" style="width:80px" />
	</label>
	<label style="margin-left:8px"
		>Offset:
		<input type="number" bind:value={offset} min="0" style="width:80px" />
	</label>
	<button onclick={splitA} style="margin-left:8px">Split A → A & B</button>
</div>

<div style="margin-top:16px;">
	<h4>Selection / Cursor info (Editor A)</h4>
	<div class="controls" style="margin-bottom:8px;">
		<button onclick={updateSelInfo}>Refresh Selection Info</button>
	</div>
	<pre class="json">{JSON.stringify(selInfo, null, 2)}</pre>
</div>

<style>
	.container {
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}
	.col {
		flex: 1;
		min-width: 320px;
	}
	.controls {
		margin-top: 8px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	pre.json {
		background: #f7f7f8;
		border: 1px solid #eee;
		padding: 8px;
		height: 160px;
		overflow: auto;
		color: black;
	}
	.split-controls {
		margin-top: 12px;
	}
	.small {
		font-size: 0.9rem;
	}
	.merged-section {
		margin-top: 18px;
		padding: 12px;
		border: 1px dashed #ddd;
		border-radius: 6px;
	}
	.merged-controls {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}
</style>
