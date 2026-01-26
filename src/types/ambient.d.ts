// Ambient declarations to satisfy svelte-check / TypeScript for Svelte projects.
// Place this file under `src/types/ambient.d.ts` so the compiler picks it up.
//
// This file declares a minimal `svelteHTML` namespace with permissive attribute types
// to avoid `Cannot find name 'svelteHTML'` or similar errors when using svelte type checking.

declare namespace svelteHTML {
  // Generic HTML attributes used by Svelte's typing when authoring components/templates.
  interface HTMLAttributes<T> {
    // Allow any attribute (keeps Svelte's template type-checking permissive for projects
    // that use dynamic / custom attributes such as data-*, aria-*, use:actions, etc.)
    [name: string]: any;
  }

  // Generic SVG attributes to avoid missing-type issues for inline SVG usage.
  interface SVGAttributes<T> {
    [name: string]: any;
  }

  // IntrinsicElements covers element typing like <div>, <span>, and custom elements.
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
