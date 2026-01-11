<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		blocks,
		documentView,
		type RenderItem,
		updateBlock,
		createBlock
	} from '$lib/stores/workspace';
	import { moveFocus } from '$lib/stores/ui';
	export let block: RenderItem;
	export let index: number;
	let element: HTMLElement;

	let content: string = block.type === 'block' ? block?.content : '';
	let checked: boolean = block.type === 'block' ? block?.completed : false;

	function setupKeyboard(node: HTMLElement) {
		const listener = (e: KeyboardEvent) => {
			console.log(e.key);
			if (e.key === 'ArrowUp' && index > 1) {
				e.preventDefault();
				moveFocus('up', $documentView, index);
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				moveFocus('down', $documentView, index);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				// create a new block below
				if (block.type !== 'block') return;
				createBlock(
					{
						block_type: 'task',
						content: '',
						completed: false,
						date: block?.date,
						id: 'new-' + Math.random().toString(36).substr(2, 9),
						agenda_order: block.agenda_order + 1
					},
					index
				);
				// move focus to the new block
				setTimeout(() => {
					moveFocus('down', $documentView, index);
				}, 0);
			} else if (e.key === 'Backspace') {
				// only delete if the content is empty
				if (node.innerText.trim() === '') {
					e.preventDefault();
					// blocks.deleteBlock(block.id, $documentView);
					// move focus to the previous block
					moveFocus('up', $documentView, index);
				}
			} else if (e.key === 'Tab') {
				e.preventDefault();
			}
		};

		node.addEventListener('keydown', listener);
		return {
			destroy: () => node.removeEventListener('keydown', listener)
		};
	}

	// format the date with the given date and a label and format like
	// Mon 1/1 The Big Deadline. Make sure theres NO comma between week and date
	function formatDateLabel(date: Date, label: string = '') {
		// get the week
		const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
			date.getUTCDay()
		];
		// get the month and day
		const monthDay = date.getUTCMonth() + 1 + '/' + date.getUTCDate();
		return `${weekday} ${monthDay} ${label}`;
	}

	function handleInput() {
		console.log(content);
		if (block.type === 'block') {
			updateBlock(block, { content: content, checked });
		}
	}
</script>

<div class="font-normal">
	{#if block.type === 'block'}
		{#if block.block_type === 'task'}
			<div class="group flex items-start gap-3 rounded-md px-2 py-1 hover:bg-white/5">
				<Checkbox bind:checked onCheckedChange={handleInput} class="mt-1.25" />
				<div
					bind:this={element}
					role="textbox"
					use:setupKeyboard
					oninput={handleInput}
					data-id={block.id}
					tabindex="0"
					contenteditable="true"
					bind:innerHTML={content}
					class="flex-1 leading-relaxed wrap-anywhere outline-none"
				>
					{@html content}
				</div>
			</div>
		{:else if block.block_type === 'header'}
			<div class="mt-6 mb-1 flex gap-1 border-b">
				<h2
					class="scroll-m-20 pb-2 text-base font-semibold tracking-tight transition-colors first:mt-0"
				>
					{formatDateLabel(new Date(block.date), block.content)}
				</h2>
				<h2
					data-id={block.id}
					contenteditable="true"
					use:setupKeyboard
					oninput={handleInput}
					bind:innerHTML={content}
					class="flex-1 pb-2 leading-relaxed font-semibold wrap-anywhere outline-none"
				>
					{@html content}
				</h2>
			</div>
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
				oninput={(e: Event) => {
					const target = e.target as HTMLDivElement;
					// get previous block in agenda order
					const prevBlock = $documentView[index - 1];
					if (prevBlock.type !== 'block') {
						target.innerHTML = '';
						return;
					}
					createBlock(
						{
							block_type: 'task',
							content: target.innerHTML,
							completed: false,
							date: block?.date,
							id: 'new-' + Math.random().toString(36).substr(2, 9),
							agenda_order: prevBlock.agenda_order + 1
						},
						index - 1
					);
					// move focus to the new block
					setTimeout(() => {
						moveFocus('up', $documentView, index + 1);
					}, 0);

					target.innerHTML = '';
				}}
				class="ghost-box flex-1 leading-relaxed wrap-anywhere outline-none"
			></div>
		</div>
	{/if}
</div>
