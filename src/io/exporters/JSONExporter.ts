// CompendiumNG Web — JSON Project Exporter
import { Project, Node, Link, NodePosition, View, Tag } from '../../core/types';
import { getAllNodes } from '../../db/nodes';
import { getAllLinks } from '../../db/links';
import { idbGetAll } from '../../db/database';
import { STORE_POSITIONS, STORE_VIEWS, STORE_TAGS } from '../../core/constants';
import { downloadText } from '../../core/utils';

export interface ProjectExport {
  version: string;
  exportedAt: number;
  project: Project;
  nodes: Node[];
  links: Link[];
  positions: NodePosition[];
  views: View[];
  tags: Tag[];
}

export async function exportProjectJSON(project: Project): Promise<void> {
  const nodes = await getAllNodes();
  const links = await getAllLinks();
  const positions = await idbGetAll<NodePosition>(STORE_POSITIONS);
  const views = await idbGetAll<View>(STORE_VIEWS);
  const tags = await idbGetAll<Tag>(STORE_TAGS);

  const data: ProjectExport = {
    version: '1.0',
    exportedAt: Date.now(),
    project,
    nodes,
    links,
    positions,
    views,
    tags,
  };

  const json = JSON.stringify(data, null, 2);
  const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}_backup.json`;
  downloadText(json, filename, 'application/json');
}
