import { writable, derived, get } from 'svelte/store';

export type Block = {
	id: string;
	block_type: 'task' | 'label' | 'text' | 'header';
	content: string;
	completed: boolean;
	date: string; // e.g., "2026-01-09"
	agenda_order: number;
};

export const blocks = writable<Block[]>();

blocks.set([
	{
		id: '498089364896',
		block_type: 'task',
		content: 'Submit project proposal #School',
		completed: false,
		date: '2026-01-14',
		agenda_order: 0
	},
	{
		id: '5328498894598',
		block_type: 'task',
		content: 'Testing a new feature',
		completed: false,
		date: '2026-01-15',
		agenda_order: 0
	},
	{
		id: '58787968899',
		block_type: 'task',
		content: 'Should have been done already',
		completed: false,
		date: '2026-01-12',
		agenda_order: 0
	},
	{
		id: '0589094909085',
		block_type: 'task',
		content: 'This one too. School #school',
		completed: false,
		date: '2026-01-12',
		agenda_order: 1
	}
]);

export type RenderItem =
	| {
			type: 'overdue';
			id: string;
			index: number;
	  }
	| {
			type: 'block';
			id: string;
			content: string;
			date: string;
			agenda_order: number;
			block_type: 'task' | 'label' | 'text' | 'header';
			completed: boolean;
			index: number;
	  }
	| { type: 'ghost'; id: string; date: string; index: number };

export const updateBlock = (block: RenderItem, newData: Object) => {
	// check if updatedBlock is of type 'block'
	if (block.type !== 'block') return;
	// create the block object
	// update the block with that id
	blocks.update((currentBlocks) => {
		return currentBlocks.map((oldBlock) =>
			block.id === oldBlock.id ? { ...oldBlock, ...newData } : oldBlock
		);
	});
};

export const documentView = derived(blocks, ($blocks) => {
	const renderList: RenderItem[] = [];
	const today = new Date();

	// Generate next 7 days including today
	const dates: string[] = [];
	for (let i = 0; i < 7; i++) {
		const date = new Date();
		date.setDate(today.getDate() + i);
		// take timezone into account so ISO date cant be used
		// get each component and pad with leading zeros
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const dateString = `${year}-${month}-${day}`;
		dates.push(dateString);
	}

	// 1. Sort blocks by date, then by their internal agenda_order
	const sortedBlocks = [...$blocks].sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		return a.agenda_order - b.agenda_order;
	});

	console.log(sortedBlocks);

	// collect all overdue blocks. since they're sorted find the first date that is >= today
	// and take all blocks before that
	// create two separate lists: overdueBlocks and upcomingBlocks
	const overdueBlocks: Block[] = [];
	const upcomingBlocks: Block[] = [];

	for (const block of sortedBlocks) {
		if (block.date < dates[0] && block.block_type === 'task' && !block.completed) {
			overdueBlocks.push(block);
		}
		if (block.date >= dates[0]) {
			upcomingBlocks.push(block);
		}
	}

	// Inject Overdue Section if there are overdue blocks
	if (overdueBlocks.length > 0) {
		renderList.push({ type: 'overdue', id: 'header-overdue', index: 0 });
		overdueBlocks.forEach((block) => {
			renderList.push({ ...block, type: 'block', index: renderList.length });
		});
	}

	dates.forEach((date) => {
		// check if theres any block with agenda_order -1 for this date
		// if so, we skip injecting the header for this date
		const hasHeaderBlock = upcomingBlocks.some((b) => b.date === date && b.agenda_order === -1);

		// Inject Date Header (unless there's a header block for this date)
		if (!hasHeaderBlock) {
			renderList.push({
				id: `header-${date}`,
				type: 'block',
				content: '',
				date,
				agenda_order: -1,
				block_type: 'header',
				completed: false,
				index: renderList.length
			});
		}

		// Inject actual Blocks
		const dayBlocks = upcomingBlocks.filter((b) => b.date === date);
		dayBlocks.forEach((block) => {
			renderList.push({ ...block, type: 'block', index: renderList.length });
		});

		// Inject Ghost (Local only)
		renderList.push({ id: `ghost-${date}`, type: 'ghost', date, index: renderList.length });
	});

	return renderList;
});

// create block (at an index)
export const createBlock = (newBlock: Block) => {
	blocks.update((currentBlocks) => {
		return currentBlocks.map((block, blockIndex) => {
			if (block.date === newBlock.date && block.agenda_order >= newBlock.agenda_order) {
				return { ...block, agenda_order: block.agenda_order + 1 };
			}
			return block;
		});
	});

	blocks.update((all) => {
		const result = [...all, newBlock];
		return result;
	});
};
