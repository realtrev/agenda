import { Node, mergeAttributes } from '@tiptap/core';

export const TaskChip = Node.create({
	name: 'taskChip',
	group: 'inline',
	inline: true,
	atom: true, // Key for "single character" behavior
	addAttributes() {
		return {
			type: { default: 'project' },
			label: { default: '' },
			color: { default: '#3b82f6' }
		};
	},
	parseHTML() {
		return [{ tag: 'span[data-type="chip"]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			'span',
			mergeAttributes(HTMLAttributes, { 'data-type': 'chip', class: 'chip-atom' }),
			0
		];
	}
});
