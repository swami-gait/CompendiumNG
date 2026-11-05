// ============================================================
// CompendiumNG Web — Constants, Colors, Icons, Labels
// ============================================================

import { NodeType, LinkType } from './types';

// --------------- Node Type Metadata ---------------

export interface NodeMeta {
  label: string;
  shortLabel: string;
  shortcut: string;        // keyboard shortcut letter
  color: string;           // fill color (hex)
  borderColor: string;
  textColor: string;
  icon: string;            // unicode emoji / symbol
  svgShape: 'diamond' | 'circle' | 'hexagon' | 'rect' | 'rounded-rect';
  description: string;
}

export const NODE_META: Record<NodeType, NodeMeta> = {
  [NodeType.QUESTION]: {
    label: 'Question / Issue',
    shortLabel: 'Question',
    shortcut: 'q',
    color: '#e0e7ff',
    borderColor: '#6366f1',
    textColor: '#312e81',
    icon: '?',
    svgShape: 'diamond',
    description: 'A question, issue, or topic requiring exploration',
  },
  [NodeType.IDEA]: {
    label: 'Idea / Answer',
    shortLabel: 'Idea',
    shortcut: 'i',
    color: '#fef3c7',
    borderColor: '#f59e0b',
    textColor: '#92400e',
    icon: '💡',
    svgShape: 'rounded-rect',
    description: 'A potential solution or answer to a question',
  },
  [NodeType.PRO]: {
    label: 'Pro / Supporting Argument',
    shortLabel: 'Pro',
    shortcut: '+',
    color: '#d1fae5',
    borderColor: '#10b981',
    textColor: '#065f46',
    icon: '+',
    svgShape: 'circle',
    description: 'An argument, evidence, or statement supporting an idea',
  },
  [NodeType.CON]: {
    label: 'Con / Objection',
    shortLabel: 'Con',
    shortcut: '-',
    color: '#ffe4e6',
    borderColor: '#f43f5e',
    textColor: '#9f1239',
    icon: '−',
    svgShape: 'circle',
    description: 'An objection, counterargument, or drawback',
  },
  [NodeType.DECISION]: {
    label: 'Decision',
    shortLabel: 'Decision',
    shortcut: 'd',
    color: '#ccfbf1',
    borderColor: '#14b8a6',
    textColor: '#134e4a',
    icon: '✓',
    svgShape: 'hexagon',
    description: 'A final consensus, resolution, or agreed decision',
  },
  [NodeType.NOTE]: {
    label: 'Note',
    shortLabel: 'Note',
    shortcut: 'n',
    color: '#f1f5f9',
    borderColor: '#64748b',
    textColor: '#334155',
    icon: '📝',
    svgShape: 'rect',
    description: 'A general-purpose note, comment, or annotation',
  },
  [NodeType.REFERENCE]: {
    label: 'Reference',
    shortLabel: 'Reference',
    shortcut: 'r',
    color: '#ffedd5',
    borderColor: '#f97316',
    textColor: '#9a3412',
    icon: '🔗',
    svgShape: 'rounded-rect',
    description: 'An external link, file, document, or URL',
  },
  [NodeType.MAP]: {
    label: 'Map',
    shortLabel: 'Map',
    shortcut: 'm',
    color: '#e0f2fe',
    borderColor: '#0ea5e9',
    textColor: '#075985',
    // Text fallback only; UIs render the mini-network via nodeIconHtml()
    icon: '⠿',
    svgShape: 'rounded-rect',
    description: 'A graphical canvas containing nodes and links (click to open)',
  },
  [NodeType.LIST]: {
    label: 'List',
    shortLabel: 'List',
    shortcut: 'l',
    color: '#f3e8ff',
    borderColor: '#a855f7',
    textColor: '#581c87',
    icon: '☰',
    svgShape: 'rounded-rect',
    description: 'A tabular list container (click to open)',
  },
};

// --------------- Inline SVG icon (HTML uses) ---------------

/**
 * Inline HTML icon for a node type. Map nodes render as a
 * mini-network — three dots joined by lines, matching the
 * original Compendium "map view" icon. Other types fall back
 * to their text glyph.
 */
export function nodeIconHtml(type: NodeType): string {
  if (type === NodeType.MAP) {
    const c = NODE_META[NodeType.MAP].textColor;
    return `<svg viewBox="0 0 20 14" width="18" height="13" aria-hidden="true" style="display:inline-block;vertical-align:-0.12em">`
      + `<line x1="3.5" y1="4" x2="10" y2="11" stroke="${c}" stroke-width="1.2"/>`
      + `<line x1="10" y1="11" x2="16.5" y2="4" stroke="${c}" stroke-width="1.2"/>`
      + `<line x1="3.5" y1="4" x2="16.5" y2="4" stroke="${c}" stroke-width="1.2"/>`
      + `<circle cx="3.5" cy="4" r="2.4" fill="${c}"/>`
      + `<circle cx="10" cy="11" r="2.4" fill="${c}"/>`
      + `<circle cx="16.5" cy="4" r="2.4" fill="${c}"/>`
      + `</svg>`;
  }
  return NODE_META[type].icon;
}

// --------------- Link Type Metadata ---------------
export interface LinkMeta {
  label: string;
  color: string;
  style: 'solid' | 'dashed';
}

export const LINK_META: Record<LinkType, LinkMeta> = {
  // Mirrors the original Compendium default link group
  // (System/resources/LinkGroups/Default.xml — "Issue-Based Information
  // System (IBIS)"), including its default colours and solid arrows.
  [LinkType.RESPONDS_TO]: { label: 'Responds To', color: '#330099', style: 'solid' },
  [LinkType.SUPPORTS]: { label: 'Supports', color: '#00FF00', style: 'solid' },
  [LinkType.OBJECTS_TO]: { label: 'Objects To', color: '#FF0000', style: 'solid' },
  [LinkType.SPECIALIZES]: { label: 'Specializes', color: '#0000FF', style: 'solid' },
  [LinkType.EXPANDS_ON]: { label: 'Expands On', color: '#FFC800', style: 'solid' },
  [LinkType.RELATED_TO]: { label: 'Related To', color: '#000000', style: 'solid' },
  [LinkType.CHALLENGES]: { label: 'Challenges', color: '#FFAFAF', style: 'solid' },
  [LinkType.RESOLVES]: { label: 'Resolves', color: '#808080', style: 'solid' },
  [LinkType.ABOUT]: { label: 'About', color: '#00FFFF', style: 'solid' },
  [LinkType.CUSTOM]: { label: 'Custom', color: '#475569', style: 'solid' },
};

// --------------- Default Dimensions ---------------

export const NODE_DEFAULT_WIDTH = 140;
export const NODE_DEFAULT_HEIGHT = 80;
export const NODE_MIN_WIDTH = 100;
export const NODE_MIN_HEIGHT = 60;
export const MAP_NODE_WIDTH = 160;
export const MAP_NODE_HEIGHT = 90;

// --------------- Canvas ---------------

export const CANVAS_ZOOM_MIN = 0.1;
export const CANVAS_ZOOM_MAX = 4.0;
export const CANVAS_ZOOM_STEP = 0.1;
export const CANVAS_GRID_SIZE = 20;  // for snapping

// --------------- System Node Labels ---------------

export const HOME_MAP_LABEL = 'Home';
export const TRASH_LABEL = 'Trash';

// --------------- Default Tag Colors ---------------

export const DEFAULT_TAG_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#f43f5e',
  '#14b8a6', '#64748b', '#f97316', '#0ea5e9', '#a855f7',
];

// --------------- Keyboard Shortcuts ---------------

export const KB_SHORTCUTS: Record<string, string> = {
  'q': 'Create Question node',
  'i': 'Create Idea node',
  '+': 'Create Pro node',
  '-': 'Create Con node',
  'd': 'Create Decision node',
  'n': 'Create Note node',
  'r': 'Create Reference node',
  'm': 'Create Map node',
  'l': 'Create List node',
  'Delete': 'Delete selected',
  'Backspace': 'Delete selected',
  'Ctrl+z': 'Undo',
  'Ctrl+y': 'Redo',
  'Ctrl+Shift+z': 'Redo',
  'Ctrl+a': 'Select all',
  'Ctrl+c': 'Copy',
  'Ctrl+v': 'Paste',
  'Ctrl+d': 'Duplicate',
  'Ctrl+f': 'Search',
  'Escape': 'Deselect / Close dialog',
  'Space': 'Pan mode (hold)',
};

// --------------- IDB Store Names ---------------

export const IDB_DB_NAME = 'compendiumng_web';
export const IDB_VERSION = 1;
export const STORE_PROJECTS = 'projects';
export const STORE_NODES = 'nodes';
export const STORE_LINKS = 'links';
export const STORE_POSITIONS = 'positions';
export const STORE_VIEWS = 'views';
export const STORE_TAGS = 'tags';
export const STORE_PREFS = 'preferences';
