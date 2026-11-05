// ============================================================
// CompendiumNG Web — Project Management (IndexedDB)
// ============================================================

import { Project, AppPreferences, Node, View } from '../core/types';
import { NodeType } from '../core/types';
import {
  STORE_PROJECTS, STORE_PREFS,
  HOME_MAP_LABEL, TRASH_LABEL,
} from '../core/constants';
import { idbGet, idbGetAll, idbPut, idbDelete } from './database';
import { generateId, now } from '../core/utils';
import { createNode } from './nodes';
import { createView } from './views';

// --------------- Projects ---------------

export async function createProject(name: string, author = 'User'): Promise<Project> {
  // Create Home Map node
  const homeNode = await createNode({
    type: NodeType.MAP,
    label: HOME_MAP_LABEL,
    author,
  });
  await createView({ id: homeNode.id, type: 'map', zoom: 1, panX: 0, panY: 0 });

  // Create Trash node
  const trashNode = await createNode({
    type: NodeType.MAP,
    label: TRASH_LABEL,
    author,
  });
  await createView({ id: trashNode.id, type: 'map', zoom: 1, panX: 0, panY: 0 });

  const project: Project = {
    id: generateId(),
    name,
    rootViewId: homeNode.id,
    homeNodeId: homeNode.id,
    trashNodeId: trashNode.id,
    createdAt: now(),
    modifiedAt: now(),
    author,
  };
  await idbPut<Project>(STORE_PROJECTS, project);
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  return idbGet<Project>(STORE_PROJECTS, id);
}

export async function getAllProjects(): Promise<Project[]> {
  return idbGetAll<Project>(STORE_PROJECTS);
}

export async function updateProject(id: string, changes: Partial<Project>): Promise<Project> {
  const existing = await getProject(id);
  if (!existing) throw new Error(`Project ${id} not found`);
  const updated = { ...existing, ...changes, id, modifiedAt: now() };
  await idbPut<Project>(STORE_PROJECTS, updated);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  await idbDelete(STORE_PROJECTS, id);
}

// --------------- Preferences ---------------

const PREFS_KEY = 'prefs';

export async function getPreferences(): Promise<AppPreferences | undefined> {
  const rec = await idbGet<AppPreferences & { id: string }>(STORE_PREFS, PREFS_KEY);
  if (!rec) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...prefs } = rec;
  return prefs as AppPreferences;
}

export async function savePreferences(prefs: AppPreferences): Promise<void> {
  await idbPut(STORE_PREFS, { id: PREFS_KEY, ...prefs });
}
