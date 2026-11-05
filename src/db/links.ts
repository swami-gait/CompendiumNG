// ============================================================
// CompendiumNG Web — Links CRUD (IndexedDB) — UPDATED with getAllLinks
// ============================================================

import { Link, LinkType } from '../core/types';
import { STORE_LINKS } from '../core/constants';
import { idbGet, idbGetAll, idbGetByIndex, idbPut, idbDelete } from './database';
import { generateId, now } from '../core/utils';

export async function createLink(
  partial: Partial<Link> & { fromNodeId: string; toNodeId: string; viewId: string }
): Promise<Link> {
  const link: Link = {
    id: partial.id ?? generateId(),
    fromNodeId: partial.fromNodeId,
    toNodeId: partial.toNodeId,
    viewId: partial.viewId,
    type: partial.type ?? LinkType.RESPONDS_TO,
    label: partial.label,
    color: partial.color,
    style: partial.style ?? 'solid',
    arrowHead: partial.arrowHead ?? 'arrow',
    createdAt: partial.createdAt ?? now(),
  };
  await idbPut<Link>(STORE_LINKS, link);
  return link;
}

export async function getLink(id: string): Promise<Link | undefined> {
  return idbGet<Link>(STORE_LINKS, id);
}

export async function getAllLinks(): Promise<Link[]> {
  return idbGetAll<Link>(STORE_LINKS);
}

export async function getLinksInView(viewId: string): Promise<Link[]> {
  return idbGetByIndex<Link>(STORE_LINKS, 'viewId', viewId);
}

export async function getLinksFromNode(nodeId: string): Promise<Link[]> {
  return idbGetByIndex<Link>(STORE_LINKS, 'fromNodeId', nodeId);
}

export async function getLinksToNode(nodeId: string): Promise<Link[]> {
  return idbGetByIndex<Link>(STORE_LINKS, 'toNodeId', nodeId);
}

export async function updateLink(id: string, changes: Partial<Link>): Promise<Link> {
  const existing = await getLink(id);
  if (!existing) throw new Error(`Link ${id} not found`);
  const updated: Link = { ...existing, ...changes, id };
  await idbPut<Link>(STORE_LINKS, updated);
  return updated;
}

export async function deleteLink(id: string): Promise<void> {
  await idbDelete(STORE_LINKS, id);
}

export async function deleteLinksInView(viewId: string): Promise<void> {
  const links = await getLinksInView(viewId);
  for (const l of links) await deleteLink(l.id);
}

export async function deleteLinksForNode(nodeId: string): Promise<void> {
  const from = await getLinksFromNode(nodeId);
  const to = await getLinksToNode(nodeId);
  for (const l of [...from, ...to]) await deleteLink(l.id);
}
