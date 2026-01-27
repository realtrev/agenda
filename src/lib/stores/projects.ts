import { writable, get, type Writable } from 'svelte/store';

/**
 * Project store
 *
 * Each project has:
 * - id: string (unique)
 * - name: string (display name)
 * - createdAt?: number (ms epoch)
 *
 * This store provides a simple API to add/get/update/remove projects.
 * The Editor's atomic node can query `getProjectName(id)` to resolve what to display.
 */

export type Project = {
	id: string;
	name: string;
	createdAt?: number;
	// future fields: color, description, metadata...
};

const initialProjects: Project[] = [
	{ id: '32587895846', name: 'Acme' },
	{ id: '59895988458', name: 'Roadmap' },
	{ id: '43987466557', name: 'AP Gov' },
	{ id: '57843785783', name: 'English Essay' }
];

const _projects: Writable<Project[]> = writable(initialProjects);

/**
 * Subscribe directly to the projects store.
 * Example: projects.subscribe(list => ...)
 */
export const projects = {
	subscribe: _projects.subscribe
};

/**
 * Synchronously get the current array of projects.
 */
export function getProjects(): Project[] {
	return get(_projects);
}

/**
 * Get a project by id or null if not found.
 */
export function getProjectById(id: string | null | undefined): Project | null {
	if (!id) return null;
	const list = get(_projects);
	return list.find((p) => p.id === id) ?? null;
}

/**
 * Get the display name for a project id, or null if not found.
 * Useful for the editor's atomic node to render "#Project Name".
 */
export function getProjectName(id: string | null | undefined): string | null {
	const p = getProjectById(id);
	return p ? p.name : null;
}

/**
 * Add a new project. If id is omitted a stable id will be generated.
 * Returns the created Project.
 */
export function addProject(input: { id?: string; name: string }): Project {
	const id = input.id ?? `proj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
	const project: Project = { id, name: String(input.name), createdAt: Date.now() };
	_projects.update((list) => {
		// avoid duplicates
		if (!list.some((p) => p.id === project.id)) {
			return [...list, project];
		}
		return list;
	});
	return project;
}

/**
 * Update an existing project by id. Returns the updated Project or null if not found.
 */
export function updateProject(id: string, patch: Partial<Project>): Project | null {
	let updated: Project | null = null;
	_projects.update((list) => {
		const next = list.map((p) => {
			if (p.id === id) {
				updated = { ...p, ...patch };
				return updated;
			}
			return p;
		});
		return next;
	});
	return updated;
}

/**
 * Remove a project by id. Returns true if removed.
 */
export function removeProject(id: string): boolean {
	let removed = false;
	_projects.update((list) => {
		const next = list.filter((p) => {
			if (p.id === id) {
				removed = true;
				return false;
			}
			return true;
		});
		return next;
	});
	return removed;
}

/**
 * Ensure a project exists with given id; if missing and name provided, create it.
 * Returns the project (existing or newly created) or null if id missing and no name.
 */
export function ensureProject(id: string | null | undefined, name?: string): Project | null {
	if (!id) return null;
	let p = getProjectById(id);
	if (p) return p;
	if (!name) return null;
	return addProject({ id, name });
}
