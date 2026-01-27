import { Node, mergeAttributes } from '@tiptap/core';
import { getProjectName, projects as projectsStore } from '$lib/stores/projects';

/**
 * ProjectChip node
 *
 * - Stores `projectId` as the only attribute.
 * - Renders a rounded blue chip that displays `#Project Name` by resolving the id via the projects store.
 * - Uses a NodeView so the label updates reactively when project names change.
 *
 * Notes:
 * - renderHTML provides a sensible fallback label so static/SSR HTML shows something.
 * - The NodeView subscribes to the projects store and unsubscribes on destroy.
 */
export default Node.create({
	name: 'projectChip',

	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			projectId: { default: null }
		};
	},

	parseHTML() {
		// Accept either an explicit data attribute or the project-chip class
		return [{ tag: 'span[data-project-chip]' }, { tag: 'span.project-chip' }];
	},

	renderHTML({ HTMLAttributes }: any) {
		const attrs = mergeAttributes(
			{
				'data-project-chip': 'true',
				class: 'project-chip'
			},
			HTMLAttributes
		);

		// fallback label uses the id so something is visible without NodeView
		const label =
			HTMLAttributes && HTMLAttributes.projectId ? `#${HTMLAttributes.projectId}` : '#Project';
		return ['span', attrs, label];
	},

	addNodeView() {
		return ({ node }) => {
			let projectId: string | null = node.attrs?.projectId ?? null;

			// Create the chip element
			const span = document.createElement('span');
			span.setAttribute('data-project-chip', 'true');
			if (projectId) span.setAttribute('data-project-id', String(projectId));
			span.className = 'project-chip';
			// Minimal inline styles to ensure visibility if CSS hasn't loaded

			function setLabel(id: string | null) {
				try {
					const name = getProjectName(id);
					span.textContent = name ? `#${name}` : id ? `#${id}` : '#Project';
				} catch {
					span.textContent = id ? `#${id}` : '#Project';
				}
			}

			setLabel(projectId);

			// Subscribe so renames/changes update the chip live
			let unsub: (() => void) | null = null;
			try {
				unsub = projectsStore.subscribe(() => {
					// only update text if project name changed (setLabel will handle it)
					setLabel(projectId);
				});
			} catch {
				unsub = null;
			}

			// Return NodeView API
			return {
				dom: span,
				update(updatedNode: any) {
					try {
						const newId = updatedNode.attrs?.projectId ?? null;
						if (newId !== projectId) {
							projectId = newId;
							if (projectId) span.setAttribute('data-project-id', String(projectId));
							else span.removeAttribute('data-project-id');
							setLabel(projectId);
						}
					} catch {
						// ignore errors during update
					}
					// keep the node view alive; return true to indicate successful update
					return true;
				},
				// Let clicks be handled by the chip (you can attach click listeners here if needed)
				stopEvent(event: Event) {
					// prevent the editor from handling clicks on the chip (so clicks can open pickers)
					return event.type === 'click';
				},
				ignoreMutation() {
					// we don't want ProseMirror to attempt to reconcile mutations inside our chip DOM
					return true;
				},
				destroy() {
					try {
						unsub && unsub();
					} catch {
						/* ignore */
					}
				}
			};
		};
	}
});
