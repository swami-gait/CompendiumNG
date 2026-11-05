// ============================================================
// CompendiumNG Web — Core Type Definitions
// ============================================================

// --------------- Node Types ---------------

export enum NodeType {
  QUESTION = 1,
  IDEA = 2,
  PRO = 3,
  CON = 4,
  DECISION = 5,
  NOTE = 6,
  REFERENCE = 7,
  MAP = 8,
  LIST = 9,
}

// --------------- Link Types ---------------

export enum LinkType {
  RESPONDS_TO = 'responds_to',
  SUPPORTS = 'supports',
  OBJECTS_TO = 'opposes',      // stored as 'opposes' by early versions
  SPECIALIZES = 'specializes',
  EXPANDS_ON = 'expands_on',
  RELATED_TO = 'related_to',
  CHALLENGES = 'challenges',
  RESOLVES = 'resolves',
  ABOUT = 'about',
  CUSTOM = 'custom',
}

// --------------- Tag ---------------

export interface Tag {
  id: string;
  name: string;
  color: string;       // hex color
  createdAt: number;
}

// --------------- Node ---------------

export interface Node {
  id: string;
  type: NodeType;
  label: string;
  detail: string;       // Rich HTML content
  referenceURL?: string; // For REFERENCE nodes
  referenceLabel?: string;
  imageURL?: string;    // Optional image attachment
  tags: string[];       // Tag IDs
  author: string;
  createdAt: number;
  modifiedAt: number;
}

// --------------- NodePosition (per-view) ---------------

export interface NodePosition {
  id: string;          // composite: `${nodeId}__${viewId}`
  nodeId: string;
  viewId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// --------------- Link ---------------

export interface Link {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  viewId: string;
  type: LinkType;
  label?: string;
  color?: string;
  style: 'solid' | 'dashed';
  arrowHead: 'arrow' | 'both' | 'none';
  createdAt: number;
}

// --------------- View (Map or List) ---------------

export interface View {
  id: string;          // Same as the Node id that "contains" this view
  type: 'map' | 'list';
  background?: string;
  zoom: number;
  panX: number;
  panY: number;
  sortField?: string;  // for List views
  sortDir?: 'asc' | 'desc';
}

// --------------- Workspace (saved arrangement of open tabs) ---------------

export interface WorkspaceTab {
  viewId: string;
  label: string;       // cached view/node label
}

// --------------- Project ---------------

export interface Project {
  id: string;
  name: string;
  rootViewId: string;  // The Home map node ID
  homeNodeId: string;  // System node ID for the Home Map
  trashNodeId: string; // System node ID for the Trash
  createdAt: number;
  modifiedAt: number;
  author: string;
}

// --------------- App State snapshot (persisted in IDB) ---------------

export interface AppPreferences {
  projectId: string;
  openTabs: WorkspaceTab[];
  activeTabViewId: string;
  sidebarWidth: number;
  detailPanelWidth: number;
  darkMode: boolean;
}

// --------------- Undo/Redo Commands ---------------

export interface Command {
  id: string;
  description: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}

// --------------- Canvas Selection ---------------

export interface SelectionState {
  nodeIds: Set<string>;
  linkIds: Set<string>;
}

// --------------- Clipboard ---------------

export interface ClipboardData {
  nodes: Array<{ node: Node; position: NodePosition }>;
  links: Link[];
  sourceViewId: string;
}

// --------------- Search Result ---------------

export interface SearchResult {
  nodeId: string;
  nodeType: NodeType;
  label: string;
  matchIn: 'label' | 'detail';
  excerpt: string;
  viewIds: string[];   // Which views this node appears in
}

// --------------- Export Options ---------------

export interface ExportOptions {
  format: 'png' | 'svg' | 'html' | 'json';
  includeAllViews?: boolean;  // for JSON/HTML
  scale?: number;             // for PNG
  filename?: string;
}
