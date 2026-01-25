import { writable, derived } from 'svelte/store';

/**
 * Workspace store: blocks of the agenda.
 *
 * Migration: `content` is now stored as a ProseMirror-compatible JSON document
 * (TipTap editor.getJSON() shape). For simple paragraphs we provide a helper
 * to create a minimal doc: pmParagraph().
 */

export type Block = {
	id: string;
	block_type: 'task' | 'label' | 'text' | 'header';
	// ProseMirror / TipTap JSON document
	content: any;
	completed: boolean;
	date: string; // e.g., "2026-01-09"
	agenda_order: number;
};

export const blocks = writable<Block[]>();

// Helper: create a minimal ProseMirror doc with a single paragraph containing `text`.
// This is compatible with StarterKit and TipTap default schema.
function pmParagraph(text: string) {
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

// Seed blocks using ProseMirror JSON for content
blocks.set([
	{
		id: '498089364896',
		block_type: 'task',
		content: pmParagraph('Submit project proposal #School'),
		completed: false,
		date: '2026-01-14',
		agenda_order: 0
	},
	{
		id: '5328498894598',
		block_type: 'task',
		content: pmParagraph('Testing a new feature hello world'),
		completed: false,
		date: '2026-01-15',
		agenda_order: 0
	},
	{
		id: '58787968899',
		block_type: 'task',
		content: pmParagraph('Should have been done already'),
		completed: false,
		date: '2026-01-12',
		agenda_order: 0
	},
	{
		id: '0589094909085',
		block_type: 'task',
		content: pmParagraph('This one too. School #school'),
		completed: false,
		date: '2026-01-12',
		agenda_order: 1
	},
	{
		id: '9699845709',
		block_type: 'header',
		content: pmParagraph('MLK Day'),
		completed: false,
		date: '2026-01-19',
		agenda_order: -1
	}
]);

export type RenderItem =
	| {
			type: 'overdue';
			id: string;
			index: number;
			content: string;
	  }
	| {
			type: 'block';
			id: string;
			content: any;
			date: string;
			agenda_order: number;
			block_type: 'task' | 'label' | 'text' | 'header';
			completed: boolean;
			index: number;
	  }
	| { type: 'ghost'; id: string; date: string; index: number };

/**
 * Update a block (by RenderItem reference). Only applies for `type === 'block'`.
 * newData can contain keys to merge into the stored Block. Note: when updating
 * `content` pass a ProseMirror JSON doc.
 */
export const updateBlock = (block: RenderItem, newData: Object) => {
	if (block.type !== 'block') return;
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
		// build YYYY-MM-DD string
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const dateString = `${year}-${month}-${day}`;
		dates.push(dateString);
	}

	// Sort blocks by date then agenda_order
	const sortedBlocks = [...$blocks].sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		return a.agenda_order - b.agenda_order;
	});

	// collect overdue and upcoming
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
		renderList.push({ type: 'overdue', id: 'header-overdue', index: 0, content: 'Overdue yeah' });
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

// create block
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

// delete a block
export const deleteBlock = (deletedBlockId: string) => {
	blocks.update((currentBlocks) => {
		return currentBlocks.filter((block) => block.id !== deletedBlockId);
	});
};
