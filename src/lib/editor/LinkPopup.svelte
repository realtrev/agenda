<script lang="ts">
	import type { Editor as TipTapEditor } from '@tiptap/core';

	let {
		editor = null,
		attrs = {},
		markStart = 0,
		markEnd = 0,
		onAction = () => {},
		onHide = () => {},
		popupAPI = null
	}: {
		editor: TipTapEditor | null;
		attrs: Record<string, any>;
		markStart: number;
		markEnd: number;
		onAction: (action: (editor: TipTapEditor, attrs: Record<string, any>) => void) => void;
		onHide: () => void;
		popupAPI: any;
	} = $props();

	let isVisible = $state(true);
	let x = $state(0);
	let y = $state(0);
	let userInitiatedHide = $state(false);

	function updatePosition() {
		if (!editor || !popupAPI || markStart === undefined) return;

		const coords = popupAPI.getMarkCoordinates(markStart);
		if (coords) {
			x = coords.left;
			y = coords.bottom;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			userInitiatedHide = true;
			isVisible = false;
			onHide();
			// Reset flag after handling blur events
			setTimeout(() => {
				userInitiatedHide = false;
			}, 50);
			return;
		}

		// Don't reappear if user just closed it
		if (userInitiatedHide) return;

		// Arrow keys and text input make popup reappear
		if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || /^[a-zA-Z0-9\s]$/.test(e.key)) {
			isVisible = true;
			setTimeout(() => updatePosition(), 0);
		}
	}

	function handlePreview() {
		if (attrs.href) {
			window.open(attrs.href, '_blank');
		}
	}

	function handleEdit() {
		const newUrl = prompt('Enter new URL:', attrs.href || '');
		if (newUrl !== null && editor) {
			onAction((editor: TipTapEditor) => {
				editor.chain().focus().setLink({ href: newUrl }).run();
			});
		}
	}

	function handleRemove() {
		if (editor) {
			onAction((editor: TipTapEditor) => {
				editor.chain().focus().unsetLink().run();
			});
		}
	}

	$effect(() => {
		// Update position whenever editor or markStart changes
		updatePosition();

		// Listen for keyboard events
		const handleKeyDownWrapper = (e: KeyboardEvent) => {
			// Don't reappear if user just closed it
			if (userInitiatedHide) return;
			handleKeyDown(e);
		};
		window.addEventListener('keydown', handleKeyDownWrapper, true);

		// Listen for scroll events to update popup position
		const handleScroll = () => {
			updatePosition();
		};
		window.addEventListener('scroll', handleScroll, true);

		// Listen for editor blur to hide popup
		const handleFocusOut = (e: FocusEvent) => {
			if (userInitiatedHide) return;
			if (editor && e.target === (editor as any).view?.dom) {
				isVisible = false;
				onHide();
			}
		};
		(editor as any).view?.dom?.addEventListener?.('focusout', handleFocusOut);

		return () => {
			window.removeEventListener('keydown', handleKeyDownWrapper, true);
			window.removeEventListener('scroll', handleScroll, true);
			(editor as any).view?.dom?.removeEventListener?.('focusout', handleFocusOut);
		};
	});
</script>

{#if isVisible}
	<div class="link-popup-wrapper" style="left: {x}px; top: {y}px;">
		<div class="link-context-menu">
			<div class="context-menu-header">
				<span class="url-preview">{attrs.href || 'No URL'}</span>
			</div>
			<div class="context-menu-actions">
				<button class="context-menu-action" onclick={handlePreview} title="Open link in new tab">
					Preview
				</button>
				<button class="context-menu-action" onclick={handleEdit} title="Edit link URL">
					Edit
				</button>
				<button class="context-menu-action" onclick={handleRemove} title="Remove link">
					Remove
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.link-popup-wrapper {
		position: fixed;
		z-index: 1001;
		animation: fadeIn 0.15s ease-out;
	}

	.link-context-menu {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		overflow: hidden;
		font-size: 14px;
	}

	.context-menu-header {
		padding: 8px 12px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.url-preview {
		color: #6b7280;
		word-break: break-all;
		white-space: normal;
		display: block;
		max-width: 250px;
	}

	.context-menu-actions {
		display: flex;
		gap: 0;
	}

	.context-menu-action {
		flex: 1;
		padding: 8px 12px;
		background: white;
		border: none;
		border-right: 1px solid #e5e7eb;
		cursor: pointer;
		color: #374151;
		font-size: 13px;
		transition: background-color 0.2s;
	}

	.context-menu-action:last-child {
		border-right: none;
	}

	.context-menu-action:hover {
		background-color: #f3f4f6;
	}

	.context-menu-action:active {
		background-color: #e5e7eb;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
