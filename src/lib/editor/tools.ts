/**
 * Utility helpers for merging and splitting TipTap / ProseMirror JSON documents.
 *
 * Exports:
 *  - mergeDocuments(a, b): merges two TipTap JSON docs into a single doc according to rules:
 *      * Concatenates top-level blocks.
 *      * If last block of A and first block of B have same type and attrs -> merge their content.
 *      * Inside inline content: adjacent `text` nodes with identical `marks` are merged.
 *      * Adjacent nodes with same type and attrs and both having content get merged recursively.
 *
 *  - splitDocumentAt(doc, pos): splits a doc at an absolute character position (or at block/offset).
 *      * Accepts `pos` as a number (absolute position across doc) OR { blockIndex, offset }.
 *      * Returns { left, right } new docs (deep-cloned, normalized).
 *      * If split occurs inside a text node with marks (bold/link/etc.), the text is split and both sides keep the same marks.
 *
 * Types are loosely modeled for TipTap/ProseMirror JSON. This module doesn't depend on TipTap runtime.
 */

/* Types */

export type PMMark = {
  type: string;
  attrs?: Record<string, any>;
};

export type PMNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: PMNode[]; // for non-text nodes containing children
  text?: string; // for text nodes
  marks?: PMMark[]; // for inline marks (text nodes)
};

export type PMDoc = {
  type: 'doc';
  content: PMNode[];
};

/* Utilities */

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function isTextNode(n: PMNode) {
  return n && n.type === 'text' && typeof n.text === 'string';
}

function normalizeAttrs(a: Record<string, any> | undefined) {
  return a ? a : undefined;
}

function attrsEqual(a?: Record<string, any>, b?: Record<string, any>) {
  const aa = a || {};
  const bb = b || {};
  const ka = Object.keys(aa);
  const kb = Object.keys(bb);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (aa[k] !== bb[k]) return false;
  }
  return true;
}

function marksEqual(a?: PMMark[], b?: PMMark[]) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type) return false;
    if (!attrsEqual(a[i].attrs, b[i].attrs)) return false;
  }
  return true;
}

/* Merge helpers */

/**
 * Merge two inline arrays: left + right.
 * Rules:
 *  - Adjacent text nodes with identical marks are concatenated into a single text node.
 *  - If prev and current are same type & attrs and both have content -> their content arrays are merged recursively.
 *  - Otherwise node is appended as-is (deep-cloned).
 */
function mergeInlineArrays(left: PMNode[], right: PMNode[]): PMNode[] {
  const result: PMNode[] = left.map((n) => deepClone(n));

  for (const node of right) {
    const prev = result[result.length - 1];

    if (!prev) {
      result.push(deepClone(node));
      continue;
    }

    // both text -> merge if marks equal
    if (isTextNode(prev) && isTextNode(node)) {
      if (marksEqual(prev.marks, node.marks)) {
        prev.text = (prev.text || '') + (node.text || '');
        continue;
      }
    }

    // both same non-text node with attrs and both have content -> merge recursively
    if (!isTextNode(prev) && !isTextNode(node) && prev.type === node.type && attrsEqual(prev.attrs, node.attrs)) {
      if (Array.isArray(prev.content) && Array.isArray(node.content)) {
        prev.content = mergeInlineArrays(prev.content, node.content);
        continue;
      }
    }

    // fallback: push clone
    result.push(deepClone(node));
  }

  return result;
}

/**
 * Normalize inline text nodes inside each block of a doc:
 * - merge adjacent text nodes with same marks
 * - recursively normalize nested content if present
 */
function normalizeInlineTextNodes(doc: PMDoc) {
  if (!doc || !Array.isArray(doc.content)) return;
  doc.content = doc.content.map((block) => {
    const out = deepClone(block);
    if (Array.isArray(out.content)) {
      // collapse adjacent text nodes with identical marks and recursively normalize children
      const items: PMNode[] = [];
      for (const child of out.content) {
        if (items.length === 0) {
          items.push(deepClone(child));
          continue;
        }
        const prev = items[items.length - 1];
        if (isTextNode(prev) && isTextNode(child) && marksEqual(prev.marks, child.marks)) {
          prev.text = (prev.text || '') + (child.text || '');
        } else if (!isTextNode(prev) && !isTextNode(child) && prev.type === child.type && attrsEqual(prev.attrs, child.attrs) && Array.isArray(prev.content) && Array.isArray(child.content)) {
          prev.content = mergeInlineArrays(prev.content, child.content);
        } else {
          items.push(deepClone(child));
        }
      }
      out.content = items.map((c) => {
        if (Array.isArray(c.content)) {
          // nested normalization
          const nestedDoc: PMDoc = { type: 'doc', content: [c] };
          normalizeInlineTextNodes(nestedDoc);
          return nestedDoc.content[0];
        }
        return c;
      });
    }
    return out;
  });
}

/**
 * Merge two top-level documents
 */
export function mergeDocuments(a: PMDoc | null | undefined, b: PMDoc | null | undefined): PMDoc {
  const docA: PMDoc = deepClone(a || { type: 'doc', content: [] });
  const docB: PMDoc = deepClone(b || { type: 'doc', content: [] });

  const ac = Array.isArray(docA.content) ? docA.content.slice() : [];
  const bc = Array.isArray(docB.content) ? docB.content.slice() : [];

  if (ac.length === 0) {
    const out: PMDoc = { type: 'doc', content: bc };
    normalizeInlineTextNodes(out);
    return out;
  }
  if (bc.length === 0) {
    const out: PMDoc = { type: 'doc', content: ac };
    normalizeInlineTextNodes(out);
    return out;
  }

  const lastA = ac[ac.length - 1];
  const firstB = bc[0];

  // If last of A and first of B are same block type and attrs, merge their content
  if (lastA.type === firstB.type && attrsEqual(lastA.attrs, firstB.attrs)) {
    const leftContent = Array.isArray(lastA.content) ? lastA.content.slice() : [];
    const rightContent = Array.isArray(firstB.content) ? firstB.content.slice() : [];

    const mergedInner = mergeInlineArrays(leftContent, rightContent);

    const mergedNode: PMNode = deepClone(lastA);
    mergedNode.content = mergedInner;

    const outContent = [...ac.slice(0, ac.length - 1), mergedNode, ...bc.slice(1)];
    const out: PMDoc = { type: 'doc', content: outContent };
    normalizeInlineTextNodes(out);
    return out;
  }

  // otherwise just concatenate and normalize
  const out: PMDoc = { type: 'doc', content: [...ac, ...bc] };
  normalizeInlineTextNodes(out);
  return out;
}

/* Split helpers */

/**
 * Compute an absolute position mapping across the document.
 * We'll treat:
 *  - Text characters have length equal to their string length.
 *  - Non-text inline nodes count as length 1.
 *  - Each block contributes inline contents lengths; we do NOT add extra overhead for block wrappers except initial document offset 0.
 *
 * Returns:
 *  - total length
 *  - an array of { blockIndex, blockLength } for each top-level block
 */
function computeBlockLengths(doc: PMDoc) {
  const blocks = doc.content || [];
  const blockLengths: { blockIndex: number; length: number }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    let len = 0;
    if (Array.isArray(block.content)) {
      for (const inline of block.content) {
        if (isTextNode(inline)) len += (inline.text || '').length;
        else len += 1;
      }
    }
    blockLengths.push({ blockIndex: i, length: len });
  }
  const total = blockLengths.reduce((s, b) => s + b.length, 0);
  return { total, blockLengths };
}

/**
 * Convert an absolute position (number) into { blockIndex, offset }.
 * If pos <= 0 -> { blockIndex: 0, offset: 0 }
 * If pos >= total -> points to last block end.
 */
function absolutePosToBlockOffset(doc: PMDoc, pos: number) {
  const { total, blockLengths } = computeBlockLengths(doc);
  if (pos <= 0) return { blockIndex: 0, offset: 0, total };
  if (pos >= total) {
    if (blockLengths.length === 0) return { blockIndex: 0, offset: 0, total };
    const last = blockLengths[blockLengths.length - 1];
    return { blockIndex: last.blockIndex, offset: last.length, total };
  }
  let accum = 0;
  for (const b of blockLengths) {
    if (accum + b.length >= pos) {
      return { blockIndex: b.blockIndex, offset: pos - accum, total };
    }
    accum += b.length;
  }
  // fallback to end of last block
  if (blockLengths.length === 0) return { blockIndex: 0, offset: 0, total };
  const last = blockLengths[blockLengths.length - 1];
  return { blockIndex: last.blockIndex, offset: last.length, total };
}

/**
 * Split a single block node at the given character offset inside its inline content.
 * Returns [leftBlock, rightBlock].
 *
 * Behavior:
 *  - Preserves node.type and attrs on both sides.
 *  - If splitting inside a text node with marks, both sides receive text nodes with identical marks.
 *  - Non-text inline node considered length 1. Splitting before/after it will move it to left/right side.
 */
function splitBlockAtOffset(block: PMNode, offset: number): [PMNode, PMNode] {
  const leftBlock: PMNode = { type: block.type, attrs: block.attrs ? deepClone(block.attrs) : undefined, content: [] };
  const rightBlock: PMNode = { type: block.type, attrs: block.attrs ? deepClone(block.attrs) : undefined, content: [] };

  if (!Array.isArray(block.content) || block.content.length === 0) {
    // Nothing inline to split; put empty block to represent a split
    return [leftBlock, rightBlock];
  }

  let remaining = offset;
  for (const inline of block.content) {
    if (remaining <= 0) {
      // whole inline goes to right
      rightBlock.content!.push(deepClone(inline));
      continue;
    }

    if (isTextNode(inline)) {
      const text = inline.text || '';
      if (text.length <= remaining) {
        leftBlock.content!.push(deepClone(inline));
        remaining -= text.length;
      } else {
        // split text node into two nodes, both preserving marks
        const leftText: PMNode = { type: 'text', text: text.slice(0, remaining) };
        if (inline.marks) leftText.marks = deepClone(inline.marks);
        const rightText: PMNode = { type: 'text', text: text.slice(remaining) };
        if (inline.marks) rightText.marks = deepClone(inline.marks);
        if ((leftText.text || '').length > 0) leftBlock.content!.push(leftText);
        if ((rightText.text || '').length > 0) rightBlock.content!.push(rightText);
        remaining = 0;
      }
    } else {
      // non-text inline node as length 1
      if (remaining > 0) {
        leftBlock.content!.push(deepClone(inline));
        remaining -= 1;
      } else {
        rightBlock.content!.push(deepClone(inline));
      }
    }
  }

  // If left or right ended up empty content, leave `content: []` to represent empty paragraph/block
  return [leftBlock, rightBlock];
}

/**
 * Split the whole document at a specified position.
 * `pos` may be:
 *  - number: absolute char position across document
 *  - { blockIndex: number, offset: number }
 *
 * Returns { left: PMDoc, right: PMDoc }
 */
export function splitDocumentAt(doc: PMDoc, pos: number | { blockIndex: number; offset: number }) {
  const d = deepClone(doc || { type: 'doc', content: [] });
  const blocks = Array.isArray(d.content) ? d.content : [];

  let target: { blockIndex: number; offset: number };

  if (typeof pos === 'number') {
    const res = absolutePosToBlockOffset(d, pos);
    target = { blockIndex: res.blockIndex, offset: res.offset };
  } else {
    target = { blockIndex: pos.blockIndex, offset: pos.offset };
  }

  // Clamp blockIndex
  const blockIndex = Math.max(0, Math.min(target.blockIndex, blocks.length - 1 >= 0 ? blocks.length - 1 : 0));
  const offset = Math.max(0, target.offset);

  const leftDoc: PMDoc = { type: 'doc', content: [] };
  const rightDoc: PMDoc = { type: 'doc', content: [] };

  // blocks before blockIndex go to left
  for (let i = 0; i < blockIndex; i++) {
    leftDoc.content.push(deepClone(blocks[i]));
  }

  // blocks after blockIndex go to right (we will append after splitting current)
  const afterBlocks = [];
  for (let i = blockIndex + 1; i < blocks.length; i++) {
    afterBlocks.push(deepClone(blocks[i]));
  }

  if (blocks.length === 0) {
    // empty doc, both sides empty docs
    return { left: leftDoc, right: rightDoc };
  }

  // split the target block at offset
  const targetBlock = blocks[blockIndex];
  const [leftBlock, rightBlock] = splitBlockAtOffset(targetBlock, offset);

  leftDoc.content.push(leftBlock);
  rightDoc.content.push(rightBlock);
  // append the rest to right
  rightDoc.content.push(...afterBlocks);

  // Normalize inline text nodes (merge adjacent text nodes with same marks)
  normalizeInlineTextNodes(leftDoc);
  normalizeInlineTextNodes(rightDoc);

  return { left: leftDoc, right: rightDoc };
}

/* Exported helpers for convenience (same names as earlier API expectation) */
export const mergeDocs = mergeDocuments;
export const splitDocAt = splitDocumentAt;
