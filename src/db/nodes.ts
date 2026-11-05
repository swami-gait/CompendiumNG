// ============================================================
// CompendiumNG Web — Node CRUD (IndexedDB)
// ============================================================

import { Node, NodeType } from '../core/types';
import { STORE_NODES } from '../core/constants';
import { idbGet, idbGetAll, idbPut, idbDelete } from './database';
import { generateId, now } from '../core/utils';

export async function createNode(
  partial: Partial<Node> & { type: NodeType; label: string }
): Promise<Node> {
  const node: Node = {
    id: partial.id ?? generateId(),
    type: partial.type,
    label: partial.label,
    detail: partial.detail ?? '',
    referenceURL: partial.referenceURL,
    referenceLabel: partial.referenceLabel,
    imageURL: partial.imageURL,
    tags: partial.tags ?? [],
    author: partial.author ?? 'User',
    createdAt: partial.createdAt ?? now(),
    modifiedAt: partial.modifiedAt ?? now(),
  };
  await idbPut<Node>(STORE_NODES, node);
  return node;
}

export async function getNode(id: string): Promise<Node | undefined> {
  return idbGet<Node>(STORE_NODES, id);
}

export async function getAllNodes(): Promise<Node[]> {
  return idbGetAll<Node>(STORE_NODES);
}

export async function updateNode(id: string, changes: Partial<Node>): Promise<Node> {
  const existing = await getNode(id);
  if (!existing) throw new Error(`Node ${id} not found`);
  const updated: Node = { ...existing, ...changes, id, modifiedAt: now() };
  await idbPut<Node>(STORE_NODES, updated);
  return updated;
}

export async function deleteNode(id: string): Promise<void> {
  await idbDelete(STORE_NODES, id);
}

/** Full-text search across label and detail (stripped of HTML) */
export async function searchNodes(
  query: string
): Promise<Array<{ node: Node; matchIn: 'label' | 'detail'; excerpt: string }>> {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const all = await getAllNodes();
  const results: Array<{ node: Node; matchIn: 'label' | 'detail'; excerpt: string }> = [];

  for (const node of all) {
    const labelLower = node.label.toLowerCase();
    if (labelLower.includes(q)) {
      results.push({
        node,
        matchIn: 'label',
        excerpt: node.label,
      });
      continue;
    }
    const detailText = stripHtml(node.detail).toLowerCase();
    if (detailText.includes(q)) {
      const idx = detailText.indexOf(q);
      const start = Math.max(0, idx - 40);
      const end = Math.min(detailText.length, idx + 80);
      results.push({
        node,
        matchIn: 'detail',
        excerpt: (start > 0 ? '…' : '') + detailText.slice(start, end) + (end < detailText.length ? '…' : ''),
      });
    }
  }
  return results;
}

function stripHtml(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
}
