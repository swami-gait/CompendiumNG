// ============================================================
// CompendiumNG Web — Views, NodePositions, Tags CRUD
// ============================================================

import { View, NodePosition, Tag } from '../core/types';
import { STORE_VIEWS, STORE_POSITIONS, STORE_TAGS } from '../core/constants';
import { idbGet, idbGetAll, idbGetByIndex, idbPut, idbDelete } from './database';
import { generateId, now } from '../core/utils';

// --------------- Views ---------------

export async function createView(
  partial: Partial<View> & { id: string; type: 'map' | 'list' }
): Promise<View> {
  const view: View = {
    id: partial.id,
    type: partial.type,
    background: partial.background,
    zoom: partial.zoom ?? 1,
    panX: partial.panX ?? 0,
    panY: partial.panY ?? 0,
    sortField: partial.sortField,
    sortDir: partial.sortDir,
  };
  await idbPut<View>(STORE_VIEWS, view);
  return view;
}

export async function getView(id: string): Promise<View | undefined> {
  return idbGet<View>(STORE_VIEWS, id);
}

export async function updateView(id: string, changes: Partial<View>): Promise<View> {
  const existing = await getView(id);
  if (!existing) throw new Error(`View ${id} not found`);
  const updated: View = { ...existing, ...changes, id };
  await idbPut<View>(STORE_VIEWS, updated);
  return updated;
}

export async function deleteView(id: string): Promise<void> {
  await idbDelete(STORE_VIEWS, id);
}

// --------------- Node Positions ---------------

export function makePositionId(nodeId: string, viewId: string): string {
  return `${nodeId}__${viewId}`;
}

export async function setNodePosition(
  nodeId: string,
  viewId: string,
  x: number,
  y: number,
  width = 140,
  height = 80
): Promise<NodePosition> {
  const pos: NodePosition = {
    id: makePositionId(nodeId, viewId),
    nodeId,
    viewId,
    x,
    y,
    width,
    height,
  };
  await idbPut<NodePosition>(STORE_POSITIONS, pos);
  return pos;
}

export async function getNodePosition(
  nodeId: string, viewId: string
): Promise<NodePosition | undefined> {
  return idbGet<NodePosition>(STORE_POSITIONS, makePositionId(nodeId, viewId));
}

export async function getPositionsInView(viewId: string): Promise<NodePosition[]> {
  return idbGetByIndex<NodePosition>(STORE_POSITIONS, 'viewId', viewId);
}

export async function getPositionsForNode(nodeId: string): Promise<NodePosition[]> {
  return idbGetByIndex<NodePosition>(STORE_POSITIONS, 'nodeId', nodeId);
}

export async function removeNodeFromView(nodeId: string, viewId: string): Promise<void> {
  await idbDelete(STORE_POSITIONS, makePositionId(nodeId, viewId));
}

export async function moveNode(
  nodeId: string, viewId: string, x: number, y: number
): Promise<void> {
  const existing = await getNodePosition(nodeId, viewId);
  if (!existing) return;
  await idbPut<NodePosition>(STORE_POSITIONS, { ...existing, x, y });
}

// --------------- Tags ---------------

export async function createTag(
  partial: Partial<Tag> & { name: string; color: string }
): Promise<Tag> {
  const tag: Tag = {
    id: partial.id ?? generateId(),
    name: partial.name,
    color: partial.color,
    createdAt: partial.createdAt ?? now(),
  };
  await idbPut<Tag>(STORE_TAGS, tag);
  return tag;
}

export async function getAllTags(): Promise<Tag[]> {
  return idbGetAll<Tag>(STORE_TAGS);
}

export async function getTag(id: string): Promise<Tag | undefined> {
  return idbGet<Tag>(STORE_TAGS, id);
}

export async function updateTag(id: string, changes: Partial<Tag>): Promise<Tag> {
  const existing = await getTag(id);
  if (!existing) throw new Error(`Tag ${id} not found`);
  const updated: Tag = { ...existing, ...changes, id };
  await idbPut<Tag>(STORE_TAGS, updated);
  return updated;
}

export async function deleteTag(id: string): Promise<void> {
  await idbDelete(STORE_TAGS, id);
}
