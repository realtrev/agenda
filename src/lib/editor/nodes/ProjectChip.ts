import { Node, mergeAttributes } from '@tiptap/core';
import { getProjectName, projects as projectsStore } from '$lib/stores/projects';

// Resolve a display label using the live store first, then a baked-in projectName attr, then the id itself.
function resolveLabel(projectId: string | null, projectName?: string | null) {
	try {
		const name = getProjectName(projectId);
		if (name) return `#${name}`;
	} catch {
		// ignore store lookup errors; fall through
	}
	if (projectName && projectName.length > 0) return `#${projectName}`;
	return projectId ? `#${projectId}` : '#Project';
}

/**
 * ProjectChip node
 *
 * - Stores `projectId` (required) and `projectName` (optional baked-in fallback for clipboard/SSR).
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
			projectId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-project-id') ?? element.getAttribute('projectid'),
				renderHTML: (attributes) => {
					if (!attributes.projectId) return {};
					return { 'data-project-id': attributes.projectId };
				}
			},
			projectName: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-project-name'),
				renderHTML: (attributes) => {
					if (!attributes.projectName) return {};
					return { 'data-project-name': attributes.projectName };
				}
			}
		};
	},

	parseHTML() {
		// Accept either an explicit data attribute or the project-chip class
		return [{ tag: 'span[data-project-chip]' }, { tag: 'span.project-chip' }];
	},

	renderHTML({ HTMLAttributes }: any) {
		const projectId = HTMLAttributes?.projectId ?? null;
		const projectName = HTMLAttributes?.projectName ?? null;
		const label = resolveLabel(projectId, projectName);
		const nameAttr = label.startsWith('#') ? label.slice(1) : label;
		const attrs = mergeAttributes(
			{
				'data-project-chip': 'true',
				class: 'project-chip'
			},
			HTMLAttributes,
			projectId ? { 'data-project-id': projectId } : {},
			{ 'data-project-name': nameAttr }
		);
		return ['span', attrs, label];
	},

	// When the editor's content is converted to plain text (e.g. copy/paste to a plain-text target),
	// provide a human-friendly representation. Try live store first (accurate), fallback to baked projectName attr.
	renderText({ node }: any) {
		const projectId: string | null = node.attrs?.projectId ?? null;
		const projectName: string | null = node.attrs?.projectName ?? null;
		// Try store first for live accuracy, fallback to projectName attr for clipboard pastes
		try {
			const storedName = getProjectName(projectId);
			if (storedName) return `#${storedName}`;
		} catch {
			// ignore store errors
		}
		// Fallback to projectName attr (set during renderHTML for clipboard preservation)
		if (projectName) return `#${projectName}`;
		return projectId ? `#${projectId}` : '#Project';
	},

	addNodeView() {
		return ({ node }) => {
			let projectId: string | null = node.attrs?.projectId ?? null;
			let projectName: string | null = node.attrs?.projectName ?? null;

			// Create the chip element
			const span = document.createElement('span');
			span.setAttribute('data-project-chip', 'true');
			if (projectId) span.setAttribute('data-project-id', String(projectId));
			if (projectName) span.setAttribute('data-project-name', String(projectName));
			span.className = 'project-chip';

			const setLabel = () => {
				span.textContent = resolveLabel(projectId, projectName);
			};

			setLabel();

			// Subscribe so renames/changes update the chip live
			let unsub: (() => void) | null = null;
			try {
				unsub = projectsStore.subscribe(() => {
					setLabel();
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
						const newName = updatedNode.attrs?.projectName ?? null;
						let changed = false;
						if (newId !== projectId) {
							projectId = newId;
							changed = true;
							if (projectId) span.setAttribute('data-project-id', String(projectId));
							else span.removeAttribute('data-project-id');
						}
						if (newName !== projectName) {
							projectName = newName;
							changed = true;
							if (projectName) span.setAttribute('data-project-name', String(projectName));
							else span.removeAttribute('data-project-name');
						}
						if (changed) setLabel();
					} catch {
						// ignore errors during update
					}
					// keep the node view alive; return true to indicate successful update
					return true;
				},
				stopEvent(event: Event) {
					return event.type === 'click';
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
