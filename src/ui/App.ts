// ============================================================
// CompendiumNG Web — Main Application Shell
// ============================================================

import { AppState } from '../state/AppState';
import { openDatabase } from '../db/database';
import { getAllProjects, createProject, getPreferences, savePreferences } from '../db/projects';
import { getView, getAllTags as fetchTags, createView, deleteView, setNodePosition, removeNodeFromView, getPositionsForNode, getNodePosition } from '../db/views';
import { getNode, createNode, updateNode, deleteNode, searchNodes } from '../db/nodes';
import { Project, NodeType, Link, LinkType, View } from '../core/types';
import { MapCanvas } from '../canvas/MapCanvas';
import { NODE_META, LINK_META, NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT, nodeIconHtml } from '../core/constants';
import { UndoManager, makeCommand } from '../history/UndoManager';
import { getLink, updateLink, getLinksInView, deleteLink, createLink as createLinkRecord, getLinksFromNode, getLinksToNode } from '../db/links';
import { formatDateShort } from '../core/utils';
import { exportProjectJSON } from '../io/exporters/JSONExporter';
import { exportMapPNG } from '../io/exporters/PNGExporter';
import { exportMapSVG } from '../io/exporters/SVGExporter';
import { exportHTMLOutline } from '../io/exporters/HTMLExporter';
import { exportWordDocument } from '../io/exporters/WordExporter';
import { importProjectJSON } from '../io/importers/JSONImporter';
import { importCompendiumXML } from '../io/importers/XMLImporter';

let activeCanvas: MapCanvas | null = null;
let currentProject: Project | null = null;

export async function initApp(): Promise<void> {
  await openDatabase();
  const prefs = await getPreferences();
  const projects = await getAllProjects();

  hideLoading();

  if (projects.length === 0) {
    showProjectScreen(true);
  } else if (prefs?.projectId) {
    const proj = projects.find(p => p.id === prefs.projectId) ?? projects[0];
    await loadProject(proj);
  } else {
    showProjectScreen(false, projects);
  }
}

function hideLoading(): void {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  el.classList.add('hidden');
  setTimeout(() => el.remove(), 400);
}

// ─── Project Screen ──────────────────────────────────────────

function showProjectScreen(isFirst: boolean, projects: Project[] = []): void {
  const screen = document.getElementById('project-screen')!;
  screen.classList.remove('hidden');
  screen.innerHTML = '';

  const inner = document.createElement('div');
  inner.className = 'project-screen-inner';

  inner.innerHTML = `
    <div class="project-screen-title">
      <svg viewBox="0 0 60 60" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
        <polygon points="30,2 58,18 58,42 30,58 2,42 2,18" fill="#082f49" stroke="#0ea5e9" stroke-width="2"/>
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#0ea5e9" font-size="22" font-weight="bold" font-family="Inter">C</text>
      </svg>
      CompendiumNG Web
    </div>
    <p class="project-screen-subtitle">
      ${isFirst ? 'Welcome! Create your first knowledge map to get started.' : 'Select a project to open, or create a new one.'}
    </p>

    <div style="margin-top:2rem;display:flex;gap:0.75rem;align-items:center">
      <button id="btn-new-project" class="btn btn-primary" style="font-size:0.9rem;padding:0.5rem 1.25rem">
        + New Project
      </button>
      <input id="project-name-input" class="detail-input" placeholder="Project name…"
        style="max-width:240px;display:inline-block" />
    </div>

    ${projects.length > 0 ? `
      <h2 style="margin-top:2rem;font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">
        Recent Projects
      </h2>
      <div class="project-card-grid" id="project-grid"></div>
    ` : ''}
  `;

  screen.appendChild(inner);

  if (projects.length > 0) {
    const grid = inner.querySelector('#project-grid')!;
    for (const p of projects) {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card-name">${p.name}</div>
        <div class="project-card-meta">Modified ${formatDateShort(p.modifiedAt)}</div>
      `;
      card.addEventListener('click', () => loadProject(p));
      grid.appendChild(card);
    }
  }

  inner.querySelector('#btn-new-project')!.addEventListener('click', async () => {
    const input = inner.querySelector<HTMLInputElement>('#project-name-input')!;
    const name = input.value.trim() || 'My Project';
    const proj = await createProject(name);
    await loadProject(proj);
  });
}

// ─── Load Project ─────────────────────────────────────────────

async function loadProject(project: Project): Promise<void> {
  currentProject = project;
  AppState.set('project', project);

  // Hide project screen
  document.getElementById('project-screen')!.classList.add('hidden');

  // Show app shell
  const shell = document.getElementById('app-shell')!;
  shell.classList.add('visible');

  // Save preference
  await savePreferences({
    projectId: project.id,
    openTabs: [],
    activeTabViewId: project.rootViewId,
    sidebarWidth: 220,
    detailPanelWidth: 280,
    darkMode: true,
  });

  // Load tags
  const tags = await fetchTags();
  AppState.set('tags', tags);

  buildShell(project);

  // Open home map
  AppState.openTab(project.rootViewId, 'Home');
  await openView(project.rootViewId);
}

// ─── Build Shell ──────────────────────────────────────────────

function buildShell(project: Project): void {
  const shell = document.getElementById('app-shell')!;
  shell.innerHTML = `
    ${buildToolbarHTML(project)}
    <div id="main-content">
      ${buildSidebarHTML()}
      <div id="view-area">
        <div id="tabbar"></div>
        <div id="canvas-container">
          <div class="canvas-empty-state" id="canvas-empty">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="32,4 60,20 60,44 32,60 4,44 4,20" fill="#e0f2fe" stroke="#0ea5e9" stroke-width="2" opacity="0.8"/>
            </svg>
            <h2>Empty Map</h2>
            <p>Click a node type in the toolbar to create nodes,<br>or right-click on the canvas.</p>
          </div>
        </div>
        <div id="statusbar">
          <span class="statusbar-item" id="status-zoom">🔍 100%</span>
          <span class="statusbar-item" id="status-nodes">0 nodes</span>
          <span class="statusbar-item" id="status-project">${project.name}</span>
        </div>
      </div>
      ${buildDetailPanelHTML()}
    </div>
    ${buildContextMenuHTML()}
    ${buildLinkEditorHTML()}
    ${buildSearchDialogHTML()}
    ${buildTagManagerHTML()}
    ${buildExportDialogHTML()}
    ${buildImportDialogHTML()}
  `;

  // Initialize canvas
  const container = document.getElementById('canvas-container')!;
  activeCanvas = new MapCanvas(container);

  wireToolbar();
  wireTabBar();
  wireSidebar(project);
  wireDetailPanel();
  wireContextMenu();
  wireSearch();
  wireTagManager();
  wireExport();
  wireImport();
  wireGlobalEvents();
  wireUndoRedo();

  updateSidebar(project);
}

// ─── HTML Builders ────────────────────────────────────────────

function buildToolbarHTML(project: Project): string {
  const nodeBtns = Object.entries(NODE_META).map(([type, meta]) => `
    <button class="node-palette-btn"
      data-create-node="${type}"
      title="${meta.label} [${meta.shortcut.toUpperCase()}]"
      style="background:${meta.color};border-color:${meta.borderColor};color:${meta.textColor}">
      <span class="npb-icon">${nodeIconHtml(Number(type) as NodeType)}</span>
      <span class="npb-label">${meta.shortLabel}</span>
    </button>
  `).join('');

  return `
  <div id="toolbar">
    <div class="toolbar-brand">
      <svg viewBox="0 0 40 40" width="22" height="22" style="flex-shrink:0">
        <polygon points="20,1 39,11 39,29 20,39 1,29 1,11" fill="#082f49" stroke="#0ea5e9" stroke-width="1.5"/>
        <text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" fill="#0ea5e9" font-size="14" font-weight="bold" font-family="Inter">C</text>
      </svg>
      <span class="brand-name">${project.name}</span>
    </div>
    <div class="toolbar-divider"></div>
    <button class="tb-btn" id="btn-toggle-sidebar" title="Toggle Sidebar">☰</button>
    <div class="toolbar-divider"></div>

    <div id="node-palette">${nodeBtns}</div>

    <div class="toolbar-divider"></div>
    <button class="tb-btn" id="btn-zoom-in"    title="Zoom In (+)">＋</button>
    <button class="tb-btn" id="btn-zoom-out"   title="Zoom Out (−)">－</button>
    <button class="tb-btn" id="btn-zoom-reset" title="Reset Zoom">⊙</button>
    <div class="toolbar-spacer"></div>
    <button class="tb-btn" id="btn-search" title="Search (Ctrl+F)">🔍</button>
    <button class="tb-btn" id="btn-tags"   title="Manage Tags">🏷</button>
    <button class="tb-btn" id="btn-import" title="Import">📥</button>
    <button class="tb-btn" id="btn-export" title="Export">📤</button>
    <div class="toolbar-divider"></div>
    <button class="tb-btn" id="btn-undo" title="Undo (Ctrl+Z)" disabled>↩</button>
    <button class="tb-btn" id="btn-redo" title="Redo (Ctrl+Y)" disabled>↪</button>
  </div>`;
}

function buildSidebarHTML(): string {

  return `
  <div id="sidebar">
    <div class="sidebar-header">
      <span>Explorer</span>
      <button class="btn btn-icon" id="btn-new-map" data-tooltip="New Map" style="width:20px;height:20px;font-size:0.75rem">+</button>
    </div>
    <div class="sidebar-tree" id="sidebar-tree"></div>
  </div>`;
}

function buildDetailPanelHTML(): string {
  return `
  <div id="detail-panel">
    <div class="detail-panel-header">
      <span class="detail-panel-title">Node Properties</span>
      <button class="btn btn-icon" id="btn-toggle-detail" style="font-size:0.7rem;width:20px;height:20px">✕</button>
    </div>
    <div class="detail-panel-body" id="detail-panel-body">
      <p style="color:var(--text-muted);font-size:var(--text-sm);text-align:center;margin-top:2rem">
        Select a node to view its properties
      </p>
    </div>
  </div>`;
}

function buildContextMenuHTML(): string {
  return `
  <div id="context-menu" class="hidden">
    <div class="ctx-item" id="ctx-open">📂 Open<span class="ctx-shortcut">Enter</span></div>
    <div class="ctx-item" id="ctx-edit">✏️ Edit Label</div>
    <div class="ctx-separator"></div>
    <div class="ctx-item" id="ctx-copy">📋 Copy<span class="ctx-shortcut">Ctrl+C</span></div>
    <div class="ctx-item" id="ctx-duplicate">🔁 Duplicate<span class="ctx-shortcut">Ctrl+D</span></div>
    <div class="ctx-separator"></div>
    <div class="ctx-item danger" id="ctx-delete">🗑 Delete<span class="ctx-shortcut">Del</span></div>
  </div>
  <div id="ctx-canvas-menu" class="hidden" style="position:fixed;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-lg);padding:var(--space-2) 0;min-width:180px;box-shadow:var(--shadow-xl);z-index:1000">
    ${Object.entries(NODE_META).map(([t, m]) =>
      `<div class="ctx-item" data-create-node="${t}">${nodeIconHtml(Number(t) as NodeType)} ${m.label}<span class="ctx-shortcut">${m.shortcut}</span></div>`
    ).join('')}
  </div>
  <div id="sidebar-ctx-menu" class="hidden" style="position:fixed;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-lg);padding:var(--space-2) 0;min-width:180px;box-shadow:var(--shadow-xl);z-index:1000">
    <div class="ctx-item" id="sctx-open">📂 Open<span class="ctx-shortcut">Enter</span></div>
    <div class="ctx-item" id="sctx-rename">✏️ Rename</div>
    <div class="ctx-separator"></div>
    <div class="ctx-item danger" id="sctx-delete">🗑 Delete Map<span class="ctx-shortcut">Del</span></div>
  </div>`;
}

function buildLinkEditorHTML(): string {
  return `
  <div id="link-editor" class="hidden"></div>`;
}

function buildSearchDialogHTML(): string {
  return `
  <div id="search-dialog" class="modal-backdrop hidden">
    <div class="modal modal-wide">
      <div class="search-input-wrap">
        <span style="color:var(--text-muted);font-size:1.2rem">🔍</span>
        <input id="search-input" type="text" placeholder="Search nodes by label or content…" autocomplete="off" />
        <kbd style="color:var(--text-muted);font-size:0.7rem;font-family:var(--font-mono)">ESC</kbd>
      </div>
      <div class="search-results" id="search-results">
        <p style="color:var(--text-muted);font-size:var(--text-sm);text-align:center;padding:1rem">
          Start typing to search…
        </p>
      </div>
    </div>
  </div>`;
}

function buildTagManagerHTML(): string {
  return `
  <div id="tag-manager" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">🏷 Tag Manager</span>
        <button class="btn btn-icon" id="tag-manager-close">✕</button>
      </div>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
        <input id="new-tag-name" class="detail-input" placeholder="Tag name…" style="flex:1" />
        <input id="new-tag-color" type="color" value="#6366f1" style="width:40px;height:36px;border:none;border-radius:6px;cursor:pointer;background:none" />
        <button class="btn btn-primary" id="btn-add-tag">Add</button>
      </div>
      <div id="tag-list" style="display:flex;flex-wrap:wrap;gap:0.5rem;min-height:60px;padding:0.5rem;background:var(--bg-overlay);border-radius:var(--radius-md)">
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="tag-manager-done">Done</button>
      </div>
    </div>
  </div>`;
}

function buildExportDialogHTML(): string {
  return `
  <div id="export-dialog" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">📤 Export</span>
        <button class="btn btn-icon" id="export-close">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <button class="btn" id="export-png" style="justify-content:flex-start;gap:0.75rem;padding:0.75rem">
          🖼 <div><div style="font-weight:600">Export as PNG</div><div style="font-size:0.75rem;color:var(--text-muted)">High-resolution image of current map</div></div>
        </button>
        <button class="btn" id="export-svg" style="justify-content:flex-start;gap:0.75rem;padding:0.75rem">
          📐 <div><div style="font-weight:600">Export as SVG</div><div style="font-size:0.75rem;color:var(--text-muted)">Vector image, infinitely scalable</div></div>
        </button>
        <button class="btn" id="export-html" style="justify-content:flex-start;gap:0.75rem;padding:0.75rem">
          🌐 <div><div style="font-weight:600">Export as HTML Outline</div><div style="font-size:0.75rem;color:var(--text-muted)">Navigable web page of current view</div></div>
        </button>
        <button class="btn" id="export-word" style="justify-content:flex-start;gap:0.75rem;padding:0.75rem">
          📝 <div><div style="font-weight:600">Export as Word Document</div><div style="font-size:0.75rem;color:var(--text-muted)">Structured outline: dialogue per map, sub-maps as sections, connection tables</div></div>
        </button>
        <button class="btn" id="export-json" style="justify-content:flex-start;gap:0.75rem;padding:0.75rem">
          💾 <div><div style="font-weight:600">Export Full Backup (JSON)</div><div style="font-size:0.75rem;color:var(--text-muted)">Complete project backup, importable later</div></div>
        </button>
      </div>
    </div>
  </div>`;
}

function buildImportDialogHTML(): string {
  return `
  <div id="import-dialog" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">📥 Import Project</span>
        <button class="btn btn-icon" id="import-close">✕</button>
      </div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary)">
        Import a CompendiumNG Web backup (JSON) or original CompendiumNG XML backup file.
      </p>
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <button class="btn btn-primary" id="import-json-btn" style="justify-content:flex-start;gap:0.75rem;padding:0.75rem">
          💾 Import JSON Backup
        </button>
        <button class="btn" id="import-xml-btn" style="justify-content:flex-start;gap:0.75rem;padding:0.75rem">
          📄 Import CompendiumNG XML
        </button>
      </div>
      <input type="file" id="import-file-input" accept=".json,.xml" style="display:none" />
      <div id="import-status" style="font-size:var(--text-sm);color:var(--text-muted);min-height:24px"></div>
    </div>
  </div>`;
}

// ─── View Management ──────────────────────────────────────────

async function openView(viewId: string): Promise<void> {
  if (!activeCanvas) return;
  const view = await getView(viewId);
  if (!view) return;

  hideLinkEditor();
  AppState.set('activeViewId', viewId);

  // Set canvas transform from saved state
  activeCanvas.interaction.setTransformExternal(view.panX, view.panY, view.zoom);
  AppState.set('zoom', view.zoom);

  await activeCanvas.loadView(viewId, view);

  // Update empty state visibility
  const empty = document.getElementById('canvas-empty');
  const positions = activeCanvas.allNodeRenderers.size;
  if (empty) empty.style.display = positions === 0 ? 'flex' : 'none';

  updateStatusBar();
}

// ─── Wire Toolbar ─────────────────────────────────────────────

function wireToolbar(): void {
  // Node creation buttons
  document.querySelectorAll<HTMLElement>('[data-create-node]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = parseInt(btn.dataset.createNode!) as NodeType;
      createNodeAtCenter(type);
    });
  });

  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar')!;
    sidebar.classList.toggle('collapsed');
  });

  document.getElementById('btn-zoom-in')?.addEventListener('click', () => activeCanvas?.interaction.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => activeCanvas?.interaction.zoomOut());
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => activeCanvas?.interaction.resetZoom());

  document.getElementById('btn-search')?.addEventListener('click', () => AppState.set('searchOpen', true));
  document.getElementById('btn-tags')?.addEventListener('click', () => AppState.set('tagManagerOpen', true));
  document.getElementById('btn-export')?.addEventListener('click', () => AppState.set('exportDialogOpen', true));
  document.getElementById('btn-import')?.addEventListener('click', () => AppState.set('importDialogOpen', true));

  // Keyboard shortcuts for node creation
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;
    // Normalise shifted keys: 'Q'→'q', '+=' pro, '_-' con etc.
    const raw = e.key;
    const key = raw.toLowerCase();
    const typeMap: Record<string, NodeType> = {
      'q': NodeType.QUESTION, 'i': NodeType.IDEA, 'a': NodeType.IDEA,
      '+': NodeType.PRO, '=': NodeType.PRO,
      '-': NodeType.CON, '_': NodeType.CON,
      'd': NodeType.DECISION, 'n': NodeType.NOTE,
      'r': NodeType.REFERENCE, 'm': NodeType.MAP, 'l': NodeType.LIST,
    };
    let type = typeMap[key];
    if (!type && raw === '=' && e.shiftKey) type = NodeType.PRO;   // Shift+= produces '+' on some layouts
    if (!type && raw === '_' && e.shiftKey) type = NodeType.CON;
    if (type) {
      e.preventDefault();
      createNodeAtCenter(type);
    }
  });
}

async function createNodeAtCenter(type: NodeType): Promise<void> {
  const viewId = AppState.get('activeViewId');
  if (!activeCanvas || !viewId) return;

  const meta = NODE_META[type];
  const canvasEl = document.getElementById('canvas-container')!;
  const rect = canvasEl.getBoundingClientRect();
  const centerPt = activeCanvas.screenToCanvas(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );

  // Offset slightly so multiple nodes don't overlap
  const offset = Math.random() * 60 - 30;
  const x = centerPt.x - NODE_DEFAULT_WIDTH / 2 + offset;
  const y = centerPt.y - NODE_DEFAULT_HEIGHT / 2 + offset;

  const node = await createNode({ type, label: meta.shortLabel, author: 'User' });
  const isContainer = type === NodeType.MAP || type === NodeType.LIST;
  if (isContainer) {
    await createView({ id: node.id, type: type === NodeType.MAP ? 'map' : 'list', zoom: 1, panX: 0, panY: 0 });
  }
  const pos = await setNodePosition(node.id, viewId, x, y, NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT);
  const nr = activeCanvas.addNodeRenderer(node, pos);
  nr.animateIn();

  // Update sidebar if a Map/List was created
  if (isContainer && currentProject) updateSidebar(currentProject);

  // Select it
  AppState.selectNode(node.id);
  activeCanvas.refreshNodeSelection();
  await showNodeDetail(node.id);

  // Hide empty state
  const empty = document.getElementById('canvas-empty');
  if (empty) empty.style.display = 'none';
  updateStatusBar();

  // Focus the label editor so the user can type the node text straight away
  // (mirrors the original CompendiumNG "Node details" prompt on creation)
  document.getElementById('detail-panel')?.classList.remove('collapsed');
  const labelInput = document.getElementById('detail-label') as HTMLInputElement | null;
  if (labelInput) {
    labelInput.focus();
    labelInput.select();
  }

  // Undo support — execute() is idempotent (same id upsert) and serves as Redo
  UndoManager.execute(makeCommand(
    `Create ${meta.label}`,
    async () => {
      await createNode(node);
      if (isContainer) {
        await createView({ id: node.id, type: type === NodeType.MAP ? 'map' : 'list', zoom: 1, panX: 0, panY: 0 });
      }
      const redoPos = await setNodePosition(node.id, viewId, x, y, NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT);
      if (activeCanvas && !activeCanvas.getNodeRenderer(node.id)) {
        activeCanvas.addNodeRenderer(node, redoPos).animateIn();
      }
      const emptyEl = document.getElementById('canvas-empty');
      if (emptyEl) emptyEl.style.display = 'none';
      if (isContainer && currentProject) await updateSidebar(currentProject);
      updateStatusBar();
    },
    async () => {
      await deleteNode(node.id);
      await removeNodeFromView(node.id, viewId);
      if (isContainer) await deleteView(node.id);
      activeCanvas?.removeNodeRenderer(node.id);
      if (isContainer) {
        AppState.closeTab(node.id);
        if (currentProject) await updateSidebar(currentProject);
      }
      updateStatusBar();
    }
  ));
}

// ─── Wire Tab Bar ─────────────────────────────────────────────

function wireTabBar(): void {
  AppState.subscribe('openTabs', () => renderTabs());
  AppState.subscribe('activeViewId', () => renderTabs());
}

function renderTabs(): void {
  const tabbar = document.getElementById('tabbar');
  if (!tabbar) return;
  tabbar.innerHTML = '';
  const tabs = AppState.get('openTabs');
  const active = AppState.get('activeViewId');
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = `tab ${tab.viewId === active ? 'active' : ''}`;
    el.innerHTML = `
      <span class="tab-label">${tab.label}</span>
      <span class="tab-close" data-close="${tab.viewId}">✕</span>
    `;
    el.addEventListener('click', async (e) => {
      if ((e.target as HTMLElement).dataset.close) return;
      AppState.set('activeViewId', tab.viewId);
      await openView(tab.viewId);
    });
    el.querySelector('[data-close]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      AppState.closeTab(tab.viewId);
    });
    tabbar.appendChild(el);
  }
}

// ─── Wire Sidebar ─────────────────────────────────────────────

function wireSidebar(project: Project): void {
  document.getElementById('btn-new-map')?.addEventListener('click', () => {
    createNodeAtCenter(NodeType.MAP);
  });

  // Explorer context menu (right-click on a map/list item)
  document.getElementById('sctx-open')?.addEventListener('click', async () => {
    const viewId = AppState.get('sidebarCtxViewId');
    if (viewId) await openNodeAsView(viewId);
  });

  document.getElementById('sctx-rename')?.addEventListener('click', async () => {
    const viewId = AppState.get('sidebarCtxViewId');
    if (!viewId) return;
    const node = await getNode(viewId);
    if (!node) return;
    const name = window.prompt('Rename map', node.label);
    if (name && name.trim() && name.trim() !== node.label) {
      await updateNode(viewId, { label: name.trim() });
      AppState.updateTabLabel(viewId, name.trim());
      if (currentProject) await updateSidebar(currentProject);
    }
  });

  document.getElementById('sctx-delete')?.addEventListener('click', async () => {
    const viewId = AppState.get('sidebarCtxViewId');
    if (viewId) await deleteMapFromExplorer(viewId);
  });
}

/**
 * Deletes a map/list node from the Explorer: the node record, its view,
 * every placement of it across all maps, and every link touching it.
 * Fully undoable.
 */
async function deleteMapFromExplorer(viewId: string): Promise<void> {
  if (!currentProject || !activeCanvas) return;
  const node = await getNode(viewId);
  if (!node) return;
  const view = await getView(viewId);
  if (!view) return;                       // Home/Trash have no view record
  if (!window.confirm(`Delete map "${node.label}"?`)) return;

  const positions = await getPositionsForNode(viewId);
  const links = [...await getLinksFromNode(viewId), ...await getLinksToNode(viewId)];
  const wasActive = AppState.get('activeViewId') === viewId;

  UndoManager.execute(makeCommand(
    `Delete map ${node.label}`,
    async () => {
      for (const l of links) await deleteLink(l.id);
      for (const p of positions) await removeNodeFromView(p.nodeId, p.viewId);
      await deleteNode(viewId);
      await deleteView(viewId);
      activeCanvas?.removeNodeRenderer(viewId);
      for (const l of links) activeCanvas?.removeLinkRenderer(l.id);
      AppState.closeTab(viewId);
      if (wasActive) {
        const act = AppState.get('activeViewId');
        if (act && act !== viewId) await openView(act);
      }
      if (currentProject) await updateSidebar(currentProject);
      updateStatusBar();
    },
    async () => {
      await createNode(node);
      await createView(view);
      for (const p of positions) {
        await setNodePosition(p.nodeId, p.viewId, p.x, p.y, p.width, p.height);
      }
      for (const l of links) await createLinkRecord(l);
      // Restore visuals on the currently open view
      const act = AppState.get('activeViewId');
      if (act) {
        const pos = positions.find(p => p.viewId === act);
        if (pos) {
          activeCanvas?.addNodeRenderer(node, pos);
          for (const l of links) {
            const from = activeCanvas?.getNodeRenderer(l.fromNodeId)?.pos;
            const to = activeCanvas?.getNodeRenderer(l.toNodeId)?.pos;
            if (from && to) activeCanvas?.addLinkRenderer(l, from, to);
          }
        }
      }
      if (currentProject) await updateSidebar(currentProject);
      updateStatusBar();
    }
  ));
}

async function updateSidebar(project: Project): Promise<void> {
  const tree = document.getElementById('sidebar-tree');
  if (!tree) return;
  tree.innerHTML = '';

  const renderItem = (viewId: string, label: string, type: NodeType | null) => {
    const item = document.createElement('div');
    item.className = `tree-item ${AppState.get('activeViewId') === viewId ? 'active' : ''}`;
    const icon = type ? nodeIconHtml(type) : (viewId === project.rootViewId ? '🏠' : '🗑');
    item.innerHTML = `<span class="tree-item-icon">${icon}</span><span class="tree-item-label">${label}</span>`;
    item.addEventListener('click', async () => {
      AppState.openTab(viewId, label);
      await openView(viewId);
      updateSidebar(project);
    });
    // Maps/lists are deletable from the Explorer via right-click
    if (type) {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const menu = document.getElementById('sidebar-ctx-menu')!;
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.classList.remove('hidden');
        AppState.set('sidebarCtxViewId', viewId);
      });
    }
    tree.appendChild(item);
  };

  renderItem(project.rootViewId, 'Home', null);

  // All Map/List nodes
  const { getAllNodes } = await import('../db/nodes');
  const allNodes = await getAllNodes();
  for (const n of allNodes) {
    if ((n.type === NodeType.MAP || n.type === NodeType.LIST) && n.id !== project.rootViewId && n.id !== project.trashNodeId) {
      renderItem(n.id, n.label, n.type);
    }
  }
  renderItem(project.trashNodeId, 'Trash', null);
}

// ─── Wire Detail Panel ────────────────────────────────────────

function wireDetailPanel(): void {
  document.getElementById('btn-toggle-detail')?.addEventListener('click', () => {
    document.getElementById('detail-panel')!.classList.toggle('collapsed');
  });

  activeCanvas?.onNodeClick((nodeId, e) => {
    AppState.selectNode(nodeId, e.shiftKey || e.ctrlKey || e.metaKey);
    activeCanvas!.refreshNodeSelection();
    showNodeDetail(nodeId);
  });

  activeCanvas?.onLinkClick((linkId, e) => {
    AppState.selectLink(linkId);
    activeCanvas!.refreshNodeSelection();
    openLinkEditor(linkId, e.clientX, e.clientY);
  });

  // Close the link editor when clicking anything outside it (the link's own
  // click event stops propagation, so opening the editor is not affected)
  document.addEventListener('mousedown', (e) => {
    const ed = document.getElementById('link-editor');
    if (ed && !ed.classList.contains('hidden') && !ed.contains(e.target as Node)) {
      hideLinkEditor();
    }
  });
}

// ─── Link Properties Editor ───────────────────────────────────

function hideLinkEditor(): void {
  document.getElementById('link-editor')?.classList.add('hidden');
}

async function openLinkEditor(linkId: string, clientX: number, clientY: number): Promise<void> {
  if (!activeCanvas) return;
  hideLinkEditor();
  const link = await getLink(linkId);
  if (!link) return;
  const [fromNode, toNode] = await Promise.all([getNode(link.fromNodeId), getNode(link.toNodeId)]);
  if (!fromNode || !toNode) return;

  const ed = document.getElementById('link-editor')!;
  const meta = LINK_META[link.type];
  const fromMeta = NODE_META[fromNode.type];
  const toMeta = NODE_META[toNode.type];

  ed.innerHTML = `
    <div class="link-editor-header">
      <span class="link-type-badge" style="color:${meta.color}">${meta.label}</span>
      <button class="btn btn-icon" id="link-editor-close" style="width:18px;height:18px;font-size:0.65rem">✕</button>
    </div>
    <div class="link-endpoints">
      <span>${nodeIconHtml(fromNode.type)} ${fromNode.label}</span>
      <span class="link-endpoint-arrow" id="link-endpoint-arrow">→</span>
      <span>${nodeIconHtml(toNode.type)} ${toNode.label}</span>
    </div>
    <input id="link-label-input" class="detail-input" placeholder="Label (e.g. because, however…) →"
      value="${(link.label ?? '').replace(/"/g, '&quot;')}" />
    <div class="link-editor-row">
      <span class="link-editor-caption">Type:</span>
      <select id="link-type-select" class="detail-input" style="flex:1">
        ${Object.entries(LINK_META).map(([t, m]) => `
          <option value="${t}" ${t === link.type ? 'selected' : ''}>${m.label}</option>
        `).join('')}
      </select>
    </div>
    <div class="link-editor-row">
      <span class="link-editor-caption">Arrow:</span>
      <button class="btn link-arrow-btn" data-arrowhead="arrow" title="Arrow at target end">→</button>
      <button class="btn link-arrow-btn" data-arrowhead="both"  title="Arrow at both ends">↔</button>
      <button class="btn link-arrow-btn" data-arrowhead="none"  title="No arrowhead">—</button>
      <span class="link-editor-spacer"></span>
      <button class="btn" id="link-reverse" title="Swap the arrow's start and end nodes">⇄ Reverse</button>
    </div>
    <div class="link-editor-row">
      <button class="btn danger" id="link-delete" style="color:#f87171">🗑 Delete</button>
    </div>
  `;

  // Position near the click, clamped to the viewport
  const W = 300, H = 240;
  const x = Math.min(Math.max(8, clientX + 8), window.innerWidth - W - 8);
  const y = Math.min(Math.max(8, clientY + 8), window.innerHeight - H - 8);
  ed.style.left = `${x}px`;
  ed.style.top = `${y}px`;
  ed.classList.remove('hidden');

  // Keep the editor alive on interactions inside it
  ed.addEventListener('mousedown', e => e.stopPropagation());
  ed.addEventListener('click', e => e.stopPropagation());

  const markArrowButtons = (current: string) => {
    ed.querySelectorAll<HTMLButtonElement>('.link-arrow-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.arrowhead === current);
    });
    document.getElementById('link-endpoint-arrow')!.textContent =
      current === 'both' ? '↔' : current === 'none' ? '—' : '→';
  };
  markArrowButtons(link.arrowHead);

  ed.querySelector('#link-editor-close')!.addEventListener('click', () => {
    hideLinkEditor();
    AppState.deselectAll();
    activeCanvas?.refreshNodeSelection();
  });

  // Custom label (empty string falls back to the link-type verb)
  const labelInput = ed.querySelector<HTMLInputElement>('#link-label-input')!;
  labelInput.addEventListener('change', async () => {
    const updated = await updateLink(link.id, { label: labelInput.value.trim() || undefined });
    activeCanvas?.getLinkRenderer(link.id)?.update(updated);
  });

  // Link type — the full IBIS link-type palette on any link, as in
  // original Compendium's "Link Content" dialog
  const typeSelect = ed.querySelector<HTMLSelectElement>('#link-type-select')!;
  typeSelect.addEventListener('change', async () => {
    const newType = typeSelect.value as LinkType;
    const updated = await updateLink(link.id, { type: newType });
    activeCanvas?.getLinkRenderer(link.id)?.update(updated);
    const m = LINK_META[newType];
    const badge = ed.querySelector<HTMLSpanElement>('.link-type-badge')!;
    badge.textContent = m.label;
    badge.style.color = m.color;
  });

  // Arrowhead style
  ed.querySelectorAll<HTMLButtonElement>('.link-arrow-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const arrowHead = btn.dataset.arrowhead as Link['arrowHead'];
      markArrowButtons(arrowHead);
      const updated = await updateLink(link.id, { arrowHead });
      activeCanvas?.getLinkRenderer(link.id)?.update(updated);
    });
  });

  // Reverse direction: swap the nodes. As in original Compendium,
  // the link type is left unchanged — the user reassigns it if the
  // narrative needs a different verb.
  ed.querySelector('#link-reverse')!.addEventListener('click', async () => {
    const updated = await updateLink(link.id, {
      fromNodeId: link.toNodeId,
      toNodeId: link.fromNodeId,
    });
    activeCanvas?.getLinkRenderer(link.id)?.update(updated);
    activeCanvas!.refreshLinkPosition(link.id);
    // Re-render the editor so the endpoints reflect the new direction
    const e = { clientX: parseInt(ed.style.left), clientY: parseInt(ed.style.top) };
    void openLinkEditor(link.id, e.clientX, e.clientY);
  });

  ed.querySelector('#link-delete')!.addEventListener('click', async () => {
    await deleteLink(link.id);
    activeCanvas?.removeLinkRenderer(link.id);
    hideLinkEditor();
    AppState.deselectAll();
  });
}

async function showNodeDetail(nodeId: string): Promise<void> {
  AppState.set('activeDetailNodeId', nodeId);
  const node = await getNode(nodeId);
  if (!node) return;

  const body = document.getElementById('detail-panel-body')!;
  const meta = NODE_META[node.type];
  const allTags = AppState.get('tags');

  body.innerHTML = `
    <div class="detail-section">
      <div class="detail-label">Type</div>
      <div class="node-type-badge" style="background:${meta.color};border-color:${meta.borderColor};color:${meta.textColor}">
        ${nodeIconHtml(node.type)} ${meta.label}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Label</div>
      <input class="detail-input" id="detail-label" value="${node.label.replace(/"/g, '&quot;')}" />
    </div>

    ${node.type === NodeType.REFERENCE ? `
    <div class="detail-section">
      <div class="detail-label">URL / Reference</div>
      <input class="detail-input" id="detail-url" type="url" value="${node.referenceURL ?? ''}" placeholder="https://…" />
    </div>` : ''}

    <div class="detail-section">
      <div class="detail-label">Notes</div>
      <div class="rich-editor-toolbar">
        <button class="btn btn-icon" onclick="document.execCommand('bold')" style="font-weight:bold;font-size:0.85rem">B</button>
        <button class="btn btn-icon" onclick="document.execCommand('italic')" style="font-style:italic;font-size:0.85rem">I</button>
        <button class="btn btn-icon" onclick="document.execCommand('underline')" style="text-decoration:underline;font-size:0.85rem">U</button>
        <button class="btn btn-icon" onclick="document.execCommand('insertUnorderedList')" style="font-size:0.85rem">•</button>
      </div>
      <div id="detail-notes" class="rich-editor" contenteditable="true">${node.detail}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Tags</div>
      <div id="detail-tags" style="display:flex;flex-wrap:wrap;gap:0.25rem;min-height:28px">
        ${node.tags.map(tid => {
          const t = allTags.find(t => t.id === tid);
          return t ? `<span class="tag-chip" style="background:${t.color}22;border-color:${t.color};color:${t.color}">${t.name} <span class="tag-chip-remove" data-remove-tag="${tid}">✕</span></span>` : '';
        }).join('')}
      </div>
      <select id="detail-add-tag" class="detail-input" style="margin-top:0.25rem">
        <option value="">+ Add tag…</option>
        ${allTags.filter(t => !node.tags.includes(t.id)).map(t =>
          `<option value="${t.id}">${t.name}</option>`
        ).join('')}
      </select>
    </div>

    <div class="detail-section" style="color:var(--text-muted);font-size:var(--text-xs)">
      Created: ${new Date(node.createdAt).toLocaleString()}<br>
      Modified: ${new Date(node.modifiedAt).toLocaleString()}<br>
      Author: ${node.author}
    </div>
  `;

  // Wire events
  const { updateNode } = await import('../db/nodes');

  const labelInput = body.querySelector<HTMLInputElement>('#detail-label')!;
  labelInput.addEventListener('change', async () => {
    const updated = await updateNode(nodeId, { label: labelInput.value });
    activeCanvas?.updateNodeRenderer(nodeId, updated);
    AppState.updateTabLabel(nodeId, updated.label);
    if (currentProject) updateSidebar(currentProject);
  });

  const notesEl = body.querySelector<HTMLElement>('#detail-notes')!;
  notesEl.addEventListener('blur', async () => {
    await updateNode(nodeId, { detail: notesEl.innerHTML });
  });

  const urlInput = body.querySelector<HTMLInputElement>('#detail-url');
  urlInput?.addEventListener('change', async () => {
    await updateNode(nodeId, { referenceURL: urlInput.value });
  });

  body.querySelector<HTMLSelectElement>('#detail-add-tag')?.addEventListener('change', async (e) => {
    const sel = e.target as HTMLSelectElement;
    const tagId = sel.value;
    if (!tagId) return;
    const updated = await updateNode(nodeId, { tags: [...node.tags, tagId] });
    showNodeDetail(nodeId);
  });

  body.querySelectorAll<HTMLElement>('[data-remove-tag]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = btn.dataset.removeTag!;
      await updateNode(nodeId, { tags: node.tags.filter(t => t !== tid) });
      showNodeDetail(nodeId);
    });
  });
}

// ─── Context Menu ─────────────────────────────────────────────

function wireContextMenu(): void {
  const menu = document.getElementById('context-menu')!;
  const canvasMenu = document.getElementById('ctx-canvas-menu')!;
  let ctxNodeId: string | null = null;
  let ctxPos: { x: number; y: number } | null = null;

  activeCanvas?.onNodeRightClick(async (nodeId, e) => {
    ctxNodeId = nodeId;
    AppState.selectNode(nodeId);
    activeCanvas!.refreshNodeSelection();
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.classList.remove('hidden');
    canvasMenu.classList.add('hidden');
  });

  activeCanvas?.onCanvasRightClick(async (x, y, e) => {
    ctxNodeId = null;
    ctxPos = { x, y };
    canvasMenu.style.left = `${e.clientX}px`;
    canvasMenu.style.top = `${e.clientY}px`;
    canvasMenu.classList.remove('hidden');
    menu.classList.add('hidden');
  });

  document.addEventListener('click', () => {
    menu.classList.add('hidden');
    canvasMenu.classList.add('hidden');
    document.getElementById('sidebar-ctx-menu')?.classList.add('hidden');
  });

  document.getElementById('ctx-delete')?.addEventListener('click', async () => {
    if (ctxNodeId) await deleteSelectedNode(ctxNodeId);
  });

  document.getElementById('ctx-open')?.addEventListener('click', async () => {
    if (ctxNodeId) await openNodeAsView(ctxNodeId);
  });

  document.getElementById('ctx-edit')?.addEventListener('click', () => {
    if (ctxNodeId) showNodeDetail(ctxNodeId);
  });

      canvasMenu.querySelectorAll<HTMLElement>('[data-create-node]').forEach(item => {
    item.addEventListener('click', async () => {
      const type = parseInt(item.dataset.createNode!) as NodeType;
      const viewId = AppState.get('activeViewId');
      if (!activeCanvas || !viewId || !ctxPos) return;
      const meta = NODE_META[type];
      const node = await createNode({ type, label: meta.shortLabel, author: 'User' });
      if (type === NodeType.MAP || type === NodeType.LIST) {
        await createView({ id: node.id, type: type === NodeType.MAP ? 'map' : 'list', zoom: 1, panX: 0, panY: 0 });
      }
      const pos = await setNodePosition(node.id, viewId, ctxPos.x, ctxPos.y, NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT);
      const nr = activeCanvas.addNodeRenderer(node, pos);
      nr.animateIn();
      updateStatusBar();
      if (type === NodeType.MAP || type === NodeType.LIST) {
        if (currentProject) await updateSidebar(currentProject);
      }
    });
  });
}

async function deleteSelectedNode(nodeId: string): Promise<void> {
  const viewId = AppState.get('activeViewId');
  if (!viewId || !activeCanvas) return;
  const node = await getNode(nodeId);
  const pos = await getNodePosition(nodeId, viewId);
  if (!node || !pos) return;

  const isContainer = node.type === NodeType.MAP || node.type === NodeType.LIST;

  // Links touching this node in the current view
  const links = await getLinksInView(viewId);
  const relLinks = links.filter(l => l.fromNodeId === nodeId || l.toNodeId === nodeId);

  // A container removed from its LAST placement disappears entirely
  // (node + view + every link), matching "delete the map" intent.
  let wholeDelete = false;
  let allLinks: Link[] = [];
  let view: View | undefined;
  if (isContainer) {
    const placements = await getPositionsForNode(nodeId);
    wholeDelete = placements.length <= 1;
    if (wholeDelete) {
      allLinks = [...await getLinksFromNode(nodeId), ...await getLinksToNode(nodeId)];
      view = await getView(nodeId);
    }
  }

  UndoManager.execute(makeCommand(
    `Delete ${NODE_META[node.type].label}`,
    async () => {
      await removeNodeFromView(nodeId, viewId);
      for (const l of relLinks) await deleteLink(l.id);
      if (wholeDelete) {
        for (const l of allLinks) await deleteLink(l.id);
        await deleteView(nodeId);
        await deleteNode(nodeId);
        const wasActive = AppState.get('activeViewId') === nodeId;
        AppState.closeTab(nodeId);
        if (wasActive) {
          const act = AppState.get('activeViewId');
          if (act && act !== nodeId) await openView(act);
        }
      }
      activeCanvas?.removeNodeRenderer(nodeId);
      for (const l of relLinks) activeCanvas?.removeLinkRenderer(l.id);
      if (currentProject) await updateSidebar(currentProject);
      updateStatusBar();
    },
    async () => {
      await createNode(node);
      if (wholeDelete) {
        await createView(view!);
        for (const l of allLinks) await createLinkRecord(l);
      }
      await setNodePosition(nodeId, viewId, pos.x, pos.y, pos.width, pos.height);
      for (const l of relLinks) await createLinkRecord(l);
      const nr = activeCanvas?.addNodeRenderer(node, pos);
      // Re-render the restored link arcs
      for (const l of relLinks) {
        const from = activeCanvas?.getNodeRenderer(l.fromNodeId)?.pos;
        const to = activeCanvas?.getNodeRenderer(l.toNodeId)?.pos;
        if (from && to) activeCanvas?.addLinkRenderer(l, from, to);
      }
      if (currentProject) await updateSidebar(currentProject);
      updateStatusBar();
    }
  ));
  updateStatusBar();
}

async function openNodeAsView(nodeId: string): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) return;
  if (node.type === NodeType.MAP || node.type === NodeType.LIST) {
    AppState.openTab(node.id, node.label);
    await openView(node.id);
    if (currentProject) updateSidebar(currentProject);
  }
}

// ─── Double-click opens Map/List nodes ───────────────────────

function wireGlobalEvents(): void {
  activeCanvas?.onNodeDblClick(async (nodeId) => {
    // Dbl-click opens Map/List views; for all other node types it opens the
    // label editor (as in the original CompendiumNG "detail" behavior)
    const node = await getNode(nodeId);
    if (!node) return;
    if (node.type === NodeType.MAP || node.type === NodeType.LIST) {
      await openNodeAsView(nodeId);
    } else {
      document.getElementById('detail-panel')?.classList.remove('collapsed');
      await showNodeDetail(nodeId);
      const labelInput = document.getElementById('detail-label') as HTMLInputElement | null;
      if (labelInput) { labelInput.focus(); labelInput.select(); }
    }
  });

  document.addEventListener('canvas:delete-selected', async () => {
    const sel = AppState.get('selection');
    for (const nodeId of sel.nodeIds) await deleteSelectedNode(nodeId);
    for (const linkId of sel.linkIds) {
      await deleteLink(linkId);
      activeCanvas?.removeLinkRenderer(linkId);
    }
    AppState.deselectAll();
  });

  // Update statusbar when zoom changes
  AppState.subscribe('zoom', (z) => {
    const el = document.getElementById('status-zoom');
    if (el) el.textContent = `🔍 ${Math.round((z as number) * 100)}%`;
  });

  // Search open/close state
  AppState.subscribe('searchOpen', (v) => {
    const d = document.getElementById('search-dialog')!;
    d.classList.toggle('hidden', !v);
    if (v) setTimeout(() => document.getElementById('search-input')?.focus(), 50);
  });

  AppState.subscribe('tagManagerOpen', (v) => {
    document.getElementById('tag-manager')!.classList.toggle('hidden', !v);
    if (v) renderTagList();
  });

  AppState.subscribe('exportDialogOpen', (v) => {
    document.getElementById('export-dialog')!.classList.toggle('hidden', !v);
  });

  AppState.subscribe('importDialogOpen', (v) => {
    document.getElementById('import-dialog')!.classList.toggle('hidden', !v);
  });
}

function updateStatusBar(): void {
  const el = document.getElementById('status-nodes');
  if (el && activeCanvas) el.textContent = `${activeCanvas.allNodeRenderers.size} nodes`;
}

// ─── Undo/Redo Buttons ────────────────────────────────────────

function wireUndoRedo(): void {
  const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement;
  const redoBtn = document.getElementById('btn-redo') as HTMLButtonElement;

  UndoManager.onChange(() => {
    undoBtn.disabled = !UndoManager.canUndo;
    redoBtn.disabled = !UndoManager.canRedo;
    if (UndoManager.canUndo) undoBtn.title = `Undo: ${UndoManager.undoLabel}`;
    if (UndoManager.canRedo) redoBtn.title = `Redo: ${UndoManager.redoLabel}`;
  });

  undoBtn.addEventListener('click', () => UndoManager.undo());
  redoBtn.addEventListener('click', () => UndoManager.redo());
}

// ─── Search ───────────────────────────────────────────────────

function wireSearch(): void {
  const input = document.getElementById('search-input') as HTMLInputElement;
  const results = document.getElementById('search-results')!;

  document.getElementById('search-dialog')!.addEventListener('click', (e) => {
    if (e.target === document.getElementById('search-dialog')) AppState.set('searchOpen', false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && AppState.get('searchOpen')) AppState.set('searchOpen', false);
  });

  let debounce: ReturnType<typeof setTimeout>;
  input?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { results.innerHTML = '<p style="color:var(--text-muted);font-size:var(--text-sm);text-align:center;padding:1rem">Start typing to search…</p>'; return; }
      const hits = await searchNodes(q);
      if (!hits.length) { results.innerHTML = '<p style="color:var(--text-muted);font-size:var(--text-sm);text-align:center;padding:1rem">No results found</p>'; return; }
      results.innerHTML = hits.slice(0, 30).map(h => {
        const meta = NODE_META[h.node.type];
        return `<div class="search-result-item" data-node-id="${h.node.id}">
          <span style="flex-shrink:0">${nodeIconHtml(h.node.type)}</span>
          <div>
            <div class="search-result-label">${h.node.label}</div>
            <div class="search-result-excerpt">${h.excerpt.substring(0, 100)}</div>
          </div>
        </div>`;
      }).join('');
      results.querySelectorAll<HTMLElement>('[data-node-id]').forEach(item => {
        item.addEventListener('click', () => {
          AppState.set('searchOpen', false);
          const nodeId = item.dataset.nodeId!;
          showNodeDetail(nodeId);
        });
      });
    }, 200);
  });
}

// ─── Tag Manager ──────────────────────────────────────────────

function wireTagManager(): void {
  document.getElementById('tag-manager-close')?.addEventListener('click', () => AppState.set('tagManagerOpen', false));
  document.getElementById('tag-manager-done')?.addEventListener('click', () => AppState.set('tagManagerOpen', false));
  document.getElementById('tag-manager')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('tag-manager')) AppState.set('tagManagerOpen', false);
  });

  document.getElementById('btn-add-tag')?.addEventListener('click', async () => {
    const name = (document.getElementById('new-tag-name') as HTMLInputElement).value.trim();
    const color = (document.getElementById('new-tag-color') as HTMLInputElement).value;
    if (!name) return;
    const { createTag, getAllTags: fetchAll } = await import('../db/views');
    await createTag({ name, color });
    const tags = await fetchAll();
    AppState.set('tags', tags);
    (document.getElementById('new-tag-name') as HTMLInputElement).value = '';
    renderTagList();
  });
}

async function renderTagList(): Promise<void> {
  const list = document.getElementById('tag-list')!;
  const tags = AppState.get('tags');
  const { deleteTag } = await import('../db/views');
  list.innerHTML = tags.map(t =>
    `<span class="tag-chip" style="background:${t.color}22;border-color:${t.color};color:${t.color}">
      ${t.name}
      <span class="tag-chip-remove" data-delete-tag="${t.id}" style="cursor:pointer">✕</span>
    </span>`
  ).join('') || '<span style="color:var(--text-muted);font-size:var(--text-sm)">No tags yet</span>';

  list.querySelectorAll<HTMLElement>('[data-delete-tag]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteTag(btn.dataset.deleteTag!);
      const { getAllTags: fetch } = await import('../db/views');
      AppState.set('tags', await fetch());
      renderTagList();
    });
  });
}

// ─── Export ───────────────────────────────────────────────────

function wireExport(): void {
  document.getElementById('export-close')?.addEventListener('click', () => AppState.set('exportDialogOpen', false));
  document.getElementById('export-dialog')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('export-dialog')) AppState.set('exportDialogOpen', false);
  });

  document.getElementById('export-png')?.addEventListener('click', async () => {
    if (!activeCanvas) return;
    await exportMapPNG(activeCanvas.svg, 'compendium_map.png', 2);
    AppState.set('exportDialogOpen', false);
  });

  document.getElementById('export-svg')?.addEventListener('click', () => {
    if (!activeCanvas) return;
    exportMapSVG(activeCanvas.svg, 'compendium_map.svg');
    AppState.set('exportDialogOpen', false);
  });

  document.getElementById('export-html')?.addEventListener('click', async () => {
    const viewId = AppState.get('activeViewId') ?? '';
    const tabs = AppState.get('openTabs');
    const label = tabs.find(t => t.viewId === viewId)?.label ?? 'Map';
    await exportHTMLOutline(viewId, label);
    AppState.set('exportDialogOpen', false);
  });

  document.getElementById('export-word')?.addEventListener('click', async () => {
    if (!currentProject) return;
    await exportWordDocument(currentProject);
    AppState.set('exportDialogOpen', false);
  });

  document.getElementById('export-json')?.addEventListener('click', async () => {
    if (!currentProject) return;
    await exportProjectJSON(currentProject);
    AppState.set('exportDialogOpen', false);
  });
}

// ─── Import ───────────────────────────────────────────────────

function wireImport(): void {
  document.getElementById('import-close')?.addEventListener('click', () => AppState.set('importDialogOpen', false));
  const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
  const status = document.getElementById('import-status')!;
  let importMode: 'json' | 'xml' = 'json';

  document.getElementById('import-json-btn')?.addEventListener('click', () => {
    importMode = 'json';
    fileInput.accept = '.json';
    fileInput.click();
  });

  document.getElementById('import-xml-btn')?.addEventListener('click', () => {
    importMode = 'xml';
    fileInput.accept = '.xml';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = 'Importing…';
    try {
      const text = await file.text();
      let projectId: string;
      if (importMode === 'json') projectId = await importProjectJSON(text);
      else projectId = await importCompendiumXML(text);
      status.textContent = '✅ Import successful! Reloading…';
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      status.textContent = `❌ Error: ${(e as Error).message}`;
    }
  });
}
