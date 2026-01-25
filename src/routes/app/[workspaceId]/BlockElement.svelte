<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import HashIcon from '@lucide/svelte/icons/hash';
	import RepeatIcon from '@lucide/svelte/icons/repeat';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		documentView,
		type RenderItem,
		updateBlock,
		createBlock,
		deleteBlock
	} from '$lib/stores/workspace';
	import { moveFocus } from '$lib/stores/ui';
	import { tick } from 'svelte';
	import { setCursor, splitFromCursor } from '$lib/utils/selection';
	export let block: RenderItem;

	let content: string = block.type === 'block' ? block?.content : '';
	let checked: boolean = block.type === 'block' ? block?.completed : false;

	function setupKeyboard(node: HTMLElement) {
		const listener = async (e: KeyboardEvent) => {
			if (!e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft') && block.index > 1) {
				const [left, right] = splitFromCursor(node);
				if (left.length === 0) {
					e.preventDefault();
					moveFocus('up', $documentView, block.index);
				}
			} else if (!e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
				const [left, right] = splitFromCursor(node);
				if (right.length === 0) {
					e.preventDefault();
					moveFocus('down', $documentView, block.index);
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				const [left, right] = splitFromCursor(node);

				// check if the block below is a ghost block
				const nextBlock = $documentView[block.index + 1];
				if (
					right.length === 0 &&
					nextBlock &&
					(nextBlock.type === 'ghost' || block.type === 'ghost')
				) {
					// move focus to the ghost block
					moveFocus('down', $documentView, block.index);
					return;
				}
				// create a new block below
				if (block.type !== 'block') return;
				updateBlock(block, { content: left });
				content = left;
				createBlock({
					block_type: 'task',
					content: right,
					completed: false,
					date: block?.date,
					id: 'new-' + Math.random().toString(36).substr(2, 9),
					agenda_order: block.agenda_order + 1
				});
				// move focus to the new block
				await tick();
				moveFocus('down', $documentView, block.index);
			} else if (e.key === 'Backspace') {
				const [left, right] = splitFromCursor(node);

				if (left.length > 0) return;

				// move focus to the previous block
				if (right.length > 0 && block.index === 1) {
					return;
				}
				e.preventDefault();
				deleteBlock(block.id);
				if (block.index === 1) {
					moveFocus('down', $documentView, block.index - 1);
				} else {
					moveFocus('up', $documentView, block.index);
				}

				// previousblock
				const prevBlock = $documentView[block.index - 1];
				if (prevBlock.type == 'block') {
					const prevBlockLength = prevBlock.content.length;
					updateBlock(prevBlock, { content: prevBlock.content + right });
					const elem = document.querySelector<HTMLElement>(`[data-id='${prevBlock.id}']`);
					if (!elem) return;
					setCursor(elem, prevBlockLength);
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
	function formatDateLabel(date: Date) {
		// get the week
		const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
			date.getUTCDay()
		];
		// get the month and day
		const monthDay = date.getUTCMonth() + 1 + '/' + date.getUTCDate();
		return `${weekday} ${monthDay}`;
	}

	function handleInput() {
		// split new lines
		if (block.type === 'block') {
			updateBlock(block, { content: content, checked });
		}
	}

	function syncText(node: HTMLElement, text: string) {
		return {
			update(newText: string) {
				// Only update the DOM if the text is actually different
				// This prevents the cursor from jumping around while typing
				if (node.textContent !== newText) {
					node.textContent = newText;
					content = newText;
					if (block.type === 'block') {
						block.content = newText;
					}
				}
			}
		};
	}
</script>

<div class="font-normal">
	{#if block.type === 'block'}
		{#if block.block_type === 'task'}
			<div class="group flex items-start gap-3 rounded-md px-2 py-1 hover:bg-white/5">
				<Checkbox bind:checked onCheckedChange={handleInput} class="mt-1.25" />
				<div
					role="textbox"
					use:setupKeyboard
					oninput={handleInput}
					data-id={block.id}
					tabindex="0"
					contenteditable="true"
					bind:innerText={content}
					use:syncText={block.content}
					class="flex-1 leading-relaxed wrap-anywhere outline-none"
				>
					{content}
				</div>

				<div class="flex h-full items-center gap-1">
					<Badge variant="outline" class="hidden group-focus-within:flex">
						<CalendarIcon />
						Friday 1/10
					</Badge>
					<Badge variant="outline" class="hidden group-focus-within:flex">
						<RepeatIcon />
						Weekly
						<XIcon />
					</Badge>
				</div>
			</div>
		{:else if block.block_type === 'header'}
			<div class="mt-6 mb-1 flex gap-1 border-b pb-2">
				<h2 class="text-base font-semibold tracking-tight transition-colors first:mt-0">
					{formatDateLabel(new Date(block.date))}
				</h2>
				<h2
					data-id={block.id}
					contenteditable="true"
					use:setupKeyboard
					oninput={handleInput}
					bind:innerText={content}
					use:syncText={block.content}
					class="flex-1 text-base font-semibold tracking-tight wrap-anywhere transition-colors outline-none first:mt-0"
				>
					{content}
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
