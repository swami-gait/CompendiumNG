// CompendiumNG Web — CompendiumNG XML Backup Importer
import { NodeType, LinkType } from '../../core/types';
import { createNode } from '../../db/nodes';
import { createLink } from '../../db/links';
import { createView, setNodePosition } from '../../db/views';
import { createProject } from '../../db/projects';
import { generateId, now } from '../../core/utils';

const NODE_TYPE_MAP: Record<string, NodeType> = {
  '1': NodeType.QUESTION,
  '2': NodeType.IDEA,
  '3': NodeType.PRO,
  '4': NodeType.CON,
  '5': NodeType.DECISION,
  '6': NodeType.NOTE,
  '7': NodeType.REFERENCE,
  '8': NodeType.MAP,
  '9': NodeType.LIST,
};

const LINK_TYPE_MAP: Record<string, LinkType> = {
  'responds to': LinkType.RESPONDS_TO,
  'supports': LinkType.SUPPORTS,
  'objects to': LinkType.OBJECTS_TO,
  'challenges': LinkType.CHALLENGES,
  'specializes': LinkType.SPECIALIZES,
  'expands on': LinkType.EXPANDS_ON,
  'related to': LinkType.RELATED_TO,
  'resolves': LinkType.RESOLVES,
  'about': LinkType.ABOUT,
};

export async function importCompendiumXML(xmlText: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const projectEl = doc.querySelector('project');
  const projectName = projectEl?.getAttribute('name') ?? 'Imported Project';

  // Create a new project shell
  const project = await createProject(projectName);
  const idMap = new Map<string, string>(); // old XML id -> new UUID

  // Import nodes
  const nodeEls = Array.from(doc.querySelectorAll('node'));
  for (const el of nodeEls) {
    const oldId = el.getAttribute('id') ?? generateId();
    const typeStr = el.getAttribute('type') ?? '6';
    const nodeType = NODE_TYPE_MAP[typeStr] ?? NodeType.NOTE;
    const label = el.getAttribute('label') ?? el.querySelector('label')?.textContent ?? 'Untitled';
    const detail = el.querySelector('detail')?.textContent ?? '';
    const referenceURL = el.getAttribute('reference') ?? undefined;

    const node = await createNode({
      type: nodeType,
      label: label.trim(),
      detail,
      referenceURL,
      author: 'Imported',
    });
    idMap.set(oldId, node.id);

    // If it's a Map/List node, create a view for it
    if (nodeType === NodeType.MAP || nodeType === NodeType.LIST) {
      await createView({
        id: node.id,
        type: nodeType === NodeType.MAP ? 'map' : 'list',
        zoom: 1, panX: 0, panY: 0,
      });
    }
  }

  // Import node positions (views)
  const viewEls = Array.from(doc.querySelectorAll('view'));
  for (const viewEl of viewEls) {
    const viewOldId = viewEl.getAttribute('viewref') ?? '';
    const viewId = idMap.get(viewOldId) ?? project.rootViewId;
    const nodePositionEls = Array.from(viewEl.querySelectorAll('nodeposition'));
    for (const posEl of nodePositionEls) {
      const nodeOldId = posEl.getAttribute('noderef') ?? '';
      const nodeId = idMap.get(nodeOldId);
      if (!nodeId) continue;
      const x = parseInt(posEl.getAttribute('xpos') ?? '100', 10);
      const y = parseInt(posEl.getAttribute('ypos') ?? '100', 10);
      await setNodePosition(nodeId, viewId, x, y);
    }
  }

  // Import links
  const linkEls = Array.from(doc.querySelectorAll('link'));
  for (const el of linkEls) {
    const fromOld = el.getAttribute('from') ?? '';
    const toOld = el.getAttribute('to') ?? '';
    const viewOld = el.getAttribute('viewref') ?? '';
    const fromId = idMap.get(fromOld);
    const toId = idMap.get(toOld);
    const viewId = idMap.get(viewOld) ?? project.rootViewId;
    if (!fromId || !toId) continue;
    const typeStr = (el.getAttribute('type') ?? 'related to').toLowerCase();
    const linkType = LINK_TYPE_MAP[typeStr] ?? LinkType.RELATED_TO;
    await createLink({ fromNodeId: fromId, toNodeId: toId, viewId, type: linkType });
  }

  return project.id;
}
