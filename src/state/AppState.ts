// ============================================================
// CompendiumNG Web — Global Reactive App State
// ============================================================

import { Project, Node, View, Tag, WorkspaceTab, SelectionState, ClipboardData } from '../core/types';
import { NodeType } from '../core/types';

type StateKey = keyof AppStateData;
type Listener<K extends StateKey> = (value: AppStateData[K]) => void;

interface AppStateData {
  project: Project | null;
  activeViewId: string | null;
  openTabs: WorkspaceTab[];
  selection: SelectionState;
  clipboard: ClipboardData | null;
  tags: Tag[];
  zoom: number;
  isLinking: boolean;           // True while drawing a link
  linkSourceNodeId: string | null;
  hoveredNodeId: string | null;
  contextMenuTarget: { nodeId?: string; linkId?: string; x: number; y: number } | null;
  sidebarCtxViewId: string | null;    // Map/list targeted by the Explorer context menu
  sidebarCollapsed: boolean;
  detailPanelCollapsed: boolean;
  activeDetailNodeId: string | null;  // Node shown in right panel
  searchOpen: boolean;
  tagManagerOpen: boolean;
  exportDialogOpen: boolean;
  importDialogOpen: boolean;
}

function emptySelection(): SelectionState {
  return { nodeIds: new Set(), linkIds: new Set() };
}

class AppStateClass {
  private data: AppStateData = {
    project: null,
    activeViewId: null,
    openTabs: [],
    selection: emptySelection(),
    clipboard: null,
    tags: [],
    zoom: 1,
    isLinking: false,
    linkSourceNodeId: null,
    hoveredNodeId: null,
    contextMenuTarget: null,
    sidebarCtxViewId: null,
    sidebarCollapsed: false,
    detailPanelCollapsed: false,
    activeDetailNodeId: null,
    searchOpen: false,
    tagManagerOpen: false,
    exportDialogOpen: false,
    importDialogOpen: false,
  };

  private listeners = new Map<StateKey, Set<Listener<StateKey>>>();

  get<K extends StateKey>(key: K): AppStateData[K] {
    return this.data[key];
  }

  set<K extends StateKey>(key: K, value: AppStateData[K]): void {
    this.data[key] = value;
    const fns = this.listeners.get(key);
    if (fns) {
      for (const fn of fns) (fn as Listener<K>)(value);
    }
  }

  subscribe<K extends StateKey>(key: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn as Listener<StateKey>);
    return () => this.listeners.get(key)?.delete(fn as Listener<StateKey>);
  }

  // --------------- Convenience helpers ---------------

  openTab(viewId: string, label: string): void {
    const tabs = this.get('openTabs');
    if (!tabs.find(t => t.viewId === viewId)) {
      this.set('openTabs', [...tabs, { viewId, label }]);
    }
    this.set('activeViewId', viewId);
  }

  closeTab(viewId: string): void {
    const tabs = this.get('openTabs').filter(t => t.viewId !== viewId);
    this.set('openTabs', tabs);
    if (this.get('activeViewId') === viewId) {
      this.set('activeViewId', tabs[tabs.length - 1]?.viewId ?? null);
    }
  }

  updateTabLabel(viewId: string, label: string): void {
    this.set('openTabs', this.get('openTabs').map(t =>
      t.viewId === viewId ? { ...t, label } : t
    ));
  }

  selectNode(nodeId: string, addToSelection = false): void {
    const sel = this.get('selection');
    if (addToSelection) {
      const newIds = new Set(sel.nodeIds);
      newIds.add(nodeId);
      this.set('selection', { ...sel, nodeIds: newIds });
    } else {
      this.set('selection', { nodeIds: new Set([nodeId]), linkIds: new Set() });
    }
    this.set('activeDetailNodeId', nodeId);
  }

  deselectAll(): void {
    this.set('selection', emptySelection());
  }

  isNodeSelected(nodeId: string): boolean {
    return this.get('selection').nodeIds.has(nodeId);
  }

  isLinkSelected(linkId: string): boolean {
    return this.get('selection').linkIds.has(linkId);
  }

  selectLink(linkId: string, addToSelection = false): void {
    const sel = this.get('selection');
    if (addToSelection) {
      const newIds = new Set(sel.linkIds);
      newIds.add(linkId);
      this.set('selection', { ...sel, linkIds: newIds });
    } else {
      this.set('selection', { nodeIds: new Set(), linkIds: new Set([linkId]) });
    }
  }
}

export const AppState = new AppStateClass();
