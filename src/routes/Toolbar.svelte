<script>
	import { onMount, onDestroy } from 'svelte';
	let editor = true; // Pass your Tiptap editor instance here

	let offsetBottom = 0;
	let isVisible = false;

	const updatePosition = () => {
		if (!window.visualViewport) return;

		// Calculate how much the keyboard is pushing up
		// window.innerHeight is the full screen, visualViewport.height is the visible part
		const keyboardHeight = window.innerHeight - window.visualViewport.height;

		// Position the bar right at the bottom of the visual area
		offsetBottom = Math.max(0, keyboardHeight);

		// Only show the bar if the keyboard is likely open (> 50px)
		isVisible = keyboardHeight > 50;
	};

	onMount(() => {
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', updatePosition);
			window.visualViewport.addEventListener('scroll', updatePosition);
		}
	});

	onDestroy(() => {
		if (window.visualViewport) {
			window.visualViewport.removeEventListener('resize', updatePosition);
			window.visualViewport.removeEventListener('scroll', updatePosition);
		}
	});
</script>

{#if editor && isVisible}
	<div class="keyboard-toolbar" style:bottom="{offsetBottom}px">
		<button>B</button>
		<button>I</button>
	</div>
{/if}

<style>
	.keyboard-toolbar {
		position: fixed;
		left: 0;
		width: 100%;
		height: 44px;
		background: #ffffff;
		border-top: 1px solid #ddd;
		display: flex;
		align-items: center;
		padding: 0 10px;
		gap: 15px;
		z-index: 9999;
		/* This ensures it moves smoothly on iOS */
		transition: bottom 0.1s ease-out;
	}

	button {
		background: none;
		border: none;
		font-weight: bold;
		font-size: 1.1rem;
		padding: 5px 10px;
	}

	button.active {
		color: #007aff;
	}
</style>
