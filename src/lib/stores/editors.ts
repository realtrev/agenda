/**
 * Simple editors registry
 *
 * Components (e.g. BlockElement.svelte) can register a focus function keyed by block id.
 * The rest of the app (e.g. moveFocus) should call `focusEditorById(id, opts)` to focus
 * the editor programmatically. This is more reliable than DOM-range fiddling and lets
 * components handle editor-specific focus/cursor behavior.
 */

export type FocusAt = 'start' | 'end' | number;
export type FocusOptions = { at?: FocusAt };

/**
 * A focus function should attempt to focus its editor and (optionally) position the
 * cursor according to the provided options. It may be asynchronous.
 */
export type FocusFn = (opts?: FocusOptions) => void | Promise<void>;

const registry = new Map<string, FocusFn>();

/**
 * Register a focus function for a given id.
 * If a function already exists for the id it will be replaced.
 */
export function registerEditor(id: string, fn: FocusFn): void {
	if (!id) return;
	if (typeof fn !== 'function') return;
	registry.set(id, fn);
}

/**
 * Unregister an editor by id.
 */
export function unregisterEditor(id: string): void {
	registry.delete(id);
}

/**
 * Try to focus a registered editor by id.
 * Returns true if an editor was found and its focus function invoked (successfully or not),
 * or false if no editor was registered for that id.
 *
 * Errors thrown by the focus function are caught and logged; the function returns false
 * in that case to indicate focus did not complete successfully.
 */
export async function focusEditorById(id: string, opts?: FocusOptions): Promise<boolean> {
	const fn = registry.get(id);
	if (!fn) return false;
	try {
		await fn(opts);
		return true;
	} catch (err) {
		// keep this non-fatal for callers; they can fallback to DOM focusing if needed
		// eslint-disable-next-line no-console
		console.error('[editors] focusEditorById error for id=', id, err);
		return false;
	}
}

/**
 * Check whether an editor is registered for the given id.
 */
export function hasEditor(id: string): boolean {
	return registry.has(id);
}

/**
 * Return a list of currently registered ids (useful for debugging).
 */
export function listRegisteredEditors(): string[] {
	return Array.from(registry.keys());
}

/**
 * Clear the entire registry (primarily for tests / teardown).
 */
export function clearEditors(): void {
	registry.clear();
}
