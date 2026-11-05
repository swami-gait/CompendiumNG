// CompendiumNG Web — JSON Project Importer
import { ProjectExport } from '../exporters/JSONExporter';
import { idbPutAll, idbClear } from '../../db/database';
import {
  STORE_NODES, STORE_LINKS, STORE_POSITIONS,
  STORE_VIEWS, STORE_TAGS, STORE_PROJECTS,
} from '../../core/constants';

export async function importProjectJSON(jsonText: string): Promise<string> {
  const data: ProjectExport = JSON.parse(jsonText);
  if (!data.version || !data.project) throw new Error('Invalid CompendiumNG backup file');

  // Import all objects into IDB
  await idbPutAll(STORE_NODES, data.nodes);
  await idbPutAll(STORE_LINKS, data.links);
  await idbPutAll(STORE_POSITIONS, data.positions);
  await idbPutAll(STORE_VIEWS, data.views);
  await idbPutAll(STORE_TAGS, data.tags ?? []);
  await idbPutAll(STORE_PROJECTS, [data.project]);

  return data.project.id;
}
