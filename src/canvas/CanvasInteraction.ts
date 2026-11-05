// ============================================================
// CompendiumNG Web — Canvas Interaction (Pan, Zoom, Drag, Select)
// REWRITTEN: self-contained drag with mousedown on each node group
// ============================================================

import { AppState } from '../state/AppState';
import { CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX, CANVAS_ZOOM_STEP } from '../core/constants';
import { clamp, svgEl } from '../core/utils';
import { moveNode } from '../db/views';
import { updateView } from '../db/views';
import type { MapCanvas } from './MapCanvas';

export class CanvasInteraction {
  private canvas: MapCanvas;
  private panX = 0;
  private panY = 0;
  private zoom = 1;

  // Pan state
  private isPanning = false;
  private panStartX = 0;   // clientX when pan began
  private panStartY = 0;
  private spaceHeld = false;

  // Drag state
  private draggingNodeId: string | null = null;
  private dragClientStartX = 0;   // raw clientX when drag began
  private dragClientStartY = 0;
  private dragNodeOriginX = 0;    // canvas-space node position when drag began
  private dragNodeOriginY = 0;
  private hasDragged = false;

  // Selection box
  private selBoxStart = { x: 0, y: 0 };
  private selBoxEl: SVGRectElement | null = null;
  private isSelecting = false;

  private handlers: Array<{ el: EventTarget; type: string; fn: EventListener }> = [];

  constructor(canvas: MapCanvas) {
    this.canvas = canvas;
    this.attach();
  }

  private on(el: EventTarget, type: string, fn: EventListener): void {
    el.addEventListener(type, fn);
    this.handlers.push({ el, type, fn });
  }

  private attach(): void {
    const svg = this.canvas.svg;

    this.on(svg,    'wheel',       this.onWheel.bind(this)       as EventListener);
    this.on(svg,    'mousedown',   this.onMouseDown.bind(this)   as EventListener);
    this.on(window, 'mousemove',   this.onMouseMove.bind(this)   as EventListener);
    this.on(window, 'mouseup',     ((e: Event) => this.onMouseUp(e as MouseEvent)) as EventListener);
    this.on(window, 'keydown',     this.onKeyDown.bind(this)     as EventListener);
    this.on(window, 'keyup',       this.onKeyUp.bind(this)       as EventListener);
    this.on(svg,    'contextmenu', this.onContextMenu.bind(this) as EventListener);
    this.on(svg,    'click',       this.onSvgClick.bind(this)    as EventListener);
  }

  // ─── Wheel zoom ──────────────────────────────────────────────
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -CANVAS_ZOOM_STEP : CANVAS_ZOOM_STEP;
    const newZoom = clamp(this.zoom + delta, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX);
    if (newZoom === this.zoom) return;

    const rect = this.canvas.svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scale = newZoom / this.zoom;
    this.panX = mouseX - scale * (mouseX - this.panX);
    this.panY = mouseY - scale * (mouseY - this.panY);
    this.zoom = newZoom;
    this.applyTransform();
    AppState.set('zoom', this.zoom);
  }

  // ─── Mousedown ────────────────────────────────────────────────
  private onMouseDown(e: MouseEvent): void {
    // Ignore right-click (handled by contextmenu)
    if (e.button === 2) return;

    const target = e.target as Element;
    const nodeGroup = target.closest('[data-node-id]') as Element | null;
    const isPort = target.classList.contains('connector-port');

    // ── Case 0: Start link drawing from a connector port ──
    if (e.button === 0 && nodeGroup && isPort) {
      const nodeId = nodeGroup.getAttribute('data-node-id')!;
      if (this.canvas.getNodeRenderer(nodeId)) {
        e.preventDefault();
        e.stopPropagation();
        this.canvas.linkDrawer.startLink(nodeId);
        return;
      }
    }

    // ── Case 1: Drag a node ──
    if (e.button === 0 && nodeGroup && !isPort && !AppState.get('isLinking')) {
      e.preventDefault(); // prevent text selection during drag
      const nodeId = nodeGroup.getAttribute('data-node-id')!;
      const nr = this.canvas.getNodeRenderer(nodeId);
      if (!nr) return;

      this.draggingNodeId = nodeId;
      this.hasDragged = false;
      // Record starting positions in client-space and canvas-space
      this.dragClientStartX = e.clientX;
      this.dragClientStartY = e.clientY;
      this.dragNodeOriginX = nr.pos.x;
      this.dragNodeOriginY = nr.pos.y;
      return;
    }

    // ── Case 2: Pan (middle button, space+left, or left on empty canvas) ──
    const wantPan = e.button === 1 || this.spaceHeld || (e.button === 0 && !nodeGroup);
    if (wantPan) {
      e.preventDefault();
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
      this.canvas.container.style.cursor = 'grabbing';
      return;
    }

    // ── Case 3: Rubber-band selection ──
    if (e.button === 0 && !nodeGroup && !this.spaceHeld) {
      const pt = this.screenToCanvas(e.clientX, e.clientY);
      this.selBoxStart = pt;
      this.isSelecting = true;
      this.selBoxEl = svgEl<SVGRectElement>('rect', {
        x: String(pt.x), y: String(pt.y), width: '0', height: '0',
        fill: 'rgba(14,165,233,0.08)', stroke: '#0ea5e9',
        'stroke-width': '1', 'stroke-dasharray': '4 2',
        'pointer-events': 'none',
      });
      this.canvas.overlayLayerEl.appendChild(this.selBoxEl);
    }
  }

  // ─── Mousemove ────────────────────────────────────────────────
  private onMouseMove(e: MouseEvent): void {
    // ── Dragging a node ──
    if (this.draggingNodeId !== null) {
      // Compute delta in CLIENT pixels, then convert to canvas units
      const dxClient = e.clientX - this.dragClientStartX;
      const dyClient = e.clientY - this.dragClientStartY;

      // Ignore tiny jitter (< 3 client-px) to prevent click-jumps
      if (!this.hasDragged && Math.abs(dxClient) < 3 && Math.abs(dyClient) < 3) return;
      this.hasDragged = true;

      // Convert delta from screen pixels → canvas units
      const dxCanvas = dxClient / this.zoom;
      const dyCanvas = dyClient / this.zoom;

      const nx = this.dragNodeOriginX + dxCanvas;
      const ny = this.dragNodeOriginY + dyCanvas;

      const nr = this.canvas.getNodeRenderer(this.draggingNodeId);
      if (nr) {
        nr.setPosition(nx, ny);
        this.canvas.updateLinkPositions(this.draggingNodeId);
      }
      return;
    }

    // ── Panning ──
    if (this.isPanning) {
      this.panX = e.clientX - this.panStartX;
      this.panY = e.clientY - this.panStartY;
      this.applyTransform();
      return;
    }

    // ── Rubber-band selection box ──
    if (this.isSelecting && this.selBoxEl) {
      const pt = this.screenToCanvas(e.clientX, e.clientY);
      const x = Math.min(pt.x, this.selBoxStart.x);
      const y = Math.min(pt.y, this.selBoxStart.y);
      const w = Math.abs(pt.x - this.selBoxStart.x);
      const h = Math.abs(pt.y - this.selBoxStart.y);
      this.selBoxEl.setAttribute('x', String(x));
      this.selBoxEl.setAttribute('y', String(y));
      this.selBoxEl.setAttribute('width', String(w));
      this.selBoxEl.setAttribute('height', String(h));
    }
  }

  // ─── Mouseup ──────────────────────────────────────────────────
  private async onMouseUp(e: MouseEvent): Promise<void> {
    // ── Finish node drag ──
    if (this.draggingNodeId !== null) {
      if (this.hasDragged) {
        const nr = this.canvas.getNodeRenderer(this.draggingNodeId);
        if (nr) {
          await moveNode(this.draggingNodeId, this.canvas.viewIdStr, nr.pos.x, nr.pos.y);
        }
      }
      this.draggingNodeId = null;
      this.hasDragged = false;
      return;
    }

    // ── Finish pan ──
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.container.style.cursor = this.spaceHeld ? 'grab' : '';
      const viewId = this.canvas.viewIdStr;
      if (viewId) await updateView(viewId, { panX: this.panX, panY: this.panY, zoom: this.zoom });
      return;
    }

    // ── Finish rubber-band selection ──
    if (this.isSelecting) {
      this.isSelecting = false;
      if (this.selBoxEl) {
        const x = parseFloat(this.selBoxEl.getAttribute('x') ?? '0');
        const y = parseFloat(this.selBoxEl.getAttribute('y') ?? '0');
        const w = parseFloat(this.selBoxEl.getAttribute('width') ?? '0');
        const h = parseFloat(this.selBoxEl.getAttribute('height') ?? '0');
        if (w > 5 || h > 5) {
          const selected = new Set<string>();
          for (const [id, nr] of this.canvas.allNodeRenderers) {
            const nx = nr.pos.x, ny = nr.pos.y, nw = nr.pos.width, nh = nr.pos.height;
            if (nx >= x && ny >= y && nx + nw <= x + w && ny + nh <= y + h) {
              selected.add(id);
            }
          }
          AppState.set('selection', { nodeIds: selected, linkIds: new Set() });
          this.canvas.refreshNodeSelection();
        }
        this.selBoxEl.remove();
        this.selBoxEl = null;
      }
    }
  }

  // ─── Convert screen coords to canvas coords ────────────────────
  /** Converts client (viewport) pixel coordinates to canvas-space coordinates. */
  screenToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.zoom,
      y: (clientY - rect.top  - this.panY) / this.zoom,
    };
  }

  // ─── Keyboard ─────────────────────────────────────────────────
  private isTextInput(t: EventTarget | null): boolean {
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ||
      (t as HTMLElement).isContentEditable;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' && !this.isTextInput(e.target)) {
      this.spaceHeld = true;
      this.canvas.container.style.cursor = 'grab';
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !this.isTextInput(e.target)) {
      e.preventDefault();
      import('../history/UndoManager').then(m => m.UndoManager.undo());
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z')) && !this.isTextInput(e.target)) {
      e.preventDefault();
      import('../history/UndoManager').then(m => m.UndoManager.redo());
    }
    if (e.key === 'Escape') {
      AppState.deselectAll();
      this.canvas.refreshNodeSelection();
      AppState.set('isLinking', false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      AppState.set('searchOpen', true);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement).isContentEditable) {
      const sel = AppState.get('selection');
      if (sel.nodeIds.size > 0 || sel.linkIds.size > 0) {
        document.dispatchEvent(new CustomEvent('canvas:delete-selected'));
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.spaceHeld = false;
      this.canvas.container.style.cursor = '';
    }
  }

  // ─── Click & right-click ──────────────────────────────────────
  private onSvgClick(e: MouseEvent): void {
    const target = e.target as Element;
    if (!target.closest('[data-node-id]') && !target.closest('[data-link-id]')) {
      AppState.deselectAll();
      this.canvas.refreshNodeSelection();
      const pt = this.screenToCanvas(e.clientX, e.clientY);
      this.canvas._fireCanvasClick(pt.x, pt.y, e);
    }
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const target = e.target as Element;
    const nodeGroup = target.closest('[data-node-id]');
    if (nodeGroup) {
      this.canvas._fireNodeRightClick(nodeGroup.getAttribute('data-node-id')!, e);
    } else {
      const pt = this.screenToCanvas(e.clientX, e.clientY);
      this.canvas._fireCanvasRightClick(pt.x, pt.y, e);
    }
  }

  // ─── External API ─────────────────────────────────────────────
  setTransformExternal(panX: number, panY: number, zoom: number): void {
    this.panX = panX;
    this.panY = panY;
    this.zoom = zoom;
    this.applyTransform();
  }

  private applyTransform(): void {
    this.canvas.setTransform(this.panX, this.panY, this.zoom);
  }

  zoomIn(): void {
    this.zoom = clamp(this.zoom + CANVAS_ZOOM_STEP, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX);
    this.applyTransform();
    AppState.set('zoom', this.zoom);
  }

  zoomOut(): void {
    this.zoom = clamp(this.zoom - CANVAS_ZOOM_STEP, CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX);
    this.applyTransform();
    AppState.set('zoom', this.zoom);
  }

  resetZoom(): void {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.applyTransform();
    AppState.set('zoom', 1);
  }

  get currentZoom(): number { return this.zoom; }
  get currentPan(): { x: number; y: number } { return { x: this.panX, y: this.panY }; }

  destroy(): void {
    for (const { el, type, fn } of this.handlers) {
      el.removeEventListener(type, fn);
    }
  }
}
