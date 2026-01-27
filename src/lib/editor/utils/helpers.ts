/**
 * General utility functions for the editor
 */

/**
 * Deep clone any value by serializing to JSON
 */
export function deepClone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}
