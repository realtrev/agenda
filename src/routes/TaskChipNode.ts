import { Node } from '@tiptap/core';
import { SvelteNodeViewRenderer } from '@tiptap/core';
import TaskChip from './TaskChip.svelte';

export const TaskChipNode = Node.create({
	name: 'taskChip',
	group: 'inline',
	inline: true,
	selectable: true, // Allows highlighting like a character
	atom: true, // This is the key: backspace deletes the whole thing

	addAttributes() {
		return {
			type: { default: 'project' }, // 'project', 'deadline', 'repeat'
			id: { default: null },
			label: { default: '' },
			color: { default: '#666' }
		};
	},

	// This renders the actual Svelte component inside the text flow
	addNodeView() {
		return SvelteNodeViewRenderer(TaskChip);
	}
});
