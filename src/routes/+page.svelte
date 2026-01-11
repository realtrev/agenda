<script lang="ts">
	import { documentView } from '$lib/stores/workspace';
	import BlockElement from './BlockElement.svelte';

	// when mouse is clicked reset selection unless clicking on a block
	$: console.log($documentView);
</script>

<!-- {#if overdue.length > 0}
	<div class="mb-10 opacity-80">
		<h3 class="mb-4 text-lg text-red-500">Overdue</h3>
		{#each overdue as block}
			<Block {block} />
		{/each}
	</div>
{/if} -->

<div class="document-container" data-id="document-view">
	<!-- enumerate document view -->
	{#each $documentView as item, index}
		<BlockElement bind:block={item} {index} />
	{/each}
</div>
