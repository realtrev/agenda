<script lang="ts">
	import type { Editor as TipTapEditor } from '@tiptap/core';

	export let editor: TipTapEditor | null = null;
	export let isVisible = false;
	export let x = 0;
	export let y = 0;
	export let menuComponent: any = null;
	export let attrs: Record<string, any> = {};
	export let onAction: (action: (editor: TipTapEditor, attrs: Record<string, any>) => void) => void =
		() => {};
</script>

{#if isVisible && menuComponent}
	<div class="popup-menu" style="left: {x}px; top: {y}px;">
		<svelte:component
			this={menuComponent}
			{editor}
			{attrs}
			{onAction}
		/>
	</div>
{/if}

<style>
	.popup-menu {
		position: fixed;
		z-index: 1001;
		animation: fadeIn 0.15s ease-out;
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
