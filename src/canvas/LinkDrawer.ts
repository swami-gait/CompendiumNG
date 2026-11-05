// ============================================================
// CompendiumNG Web — Interactive Link Drawing
// ============================================================

import { AppState } from '../state/AppState';
import { svgEl } from '../core/utils';
import { createLink, deleteLink, getLinksInView } from '../db/links';
import { getNodePosition } from '../db/views';
import { UndoManager, makeCommand } from '../history/UndoManager';
import { getNode } from '../db/nodes';
import { LinkType, NodeType } from '../core/types';
import { getDefaultLinkType } from '../core/linkRules';
import { showToast } from '../ui/toast';
import type { MapCanvas } from './MapCanvas';

const PREVIEW_COLOR = '#0ea5e9';
const PREVIEW_COLOR_OK = '#10b981';

export class LinkDrawer {
  private canvas: MapCanvas;
  private previewLine: SVGLineElement | null = null;
  private sourceNodeId: string | null = null;
  /** Cache of node types discovered while drawing */
  private sourceType: NodeType | null = null;
  private hoverTargetId: string | null = null;
  private hoverTargetType: NodeType | null = null;
  private hoverValid = true;
  private hoverType: LinkType | null = null;

  constructor(canvas: MapCanvas) {
    this.canvas = canvas;
    this.attach();
  }

  private attach(): void {
    this.canvas.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
  }

  startLink(fromNodeId: string): void {
    this.sourceNodeId = fromNodeId;
    this.hoverTargetId = null;
    this.hoverTargetType = null;
    this.hoverValid = true;
    this.hoverType = null;
    AppState.set('isLinking', true);
    AppState.set('linkSourceNodeId', fromNodeId);
    this.canvas.container.style.cursor = 'crosshair';

    // Resolve the source node type lazily (may not be loaded yet)
    void getNode(fromNodeId).then((node) => { this.sourceType = node?.type ?? null; });

    // Create preview line
    this.previewLine = svgEl<SVGLineElement>('line', {
      stroke: PREVIEW_COLOR, 'stroke-width': '2', 'stroke-dasharray': '6 4',
      'pointer-events': 'none',
    });
    this.canvas.overlayLayerEl.appendChild(this.previewLine);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!AppState.get('isLinking') || !this.previewLine || !this.sourceNodeId) return;
    const nr = this.canvas.getNodeRenderer(this.sourceNodeId);
    if (!nr) return;
    const pt = this.canvas.screenToCanvas(e.clientX, e.clientY);
    const fromX = nr.pos.x + nr.pos.width / 2;
    const fromY = nr.pos.y + nr.pos.height / 2;
    this.previewLine.setAttribute('x1', String(fromX));
    this.previewLine.setAttribute('y1', String(fromY));
    this.previewLine.setAttribute('x2', String(pt.x));
    this.previewLine.setAttribute('y2', String(pt.y));

    this.updateHoverTarget(e);
    const color = this.hoverTargetId ? PREVIEW_COLOR_OK : PREVIEW_COLOR;
    this.previewLine.setAttribute('stroke', color);
  }

  /** Tracks the node under the cursor while drawing (any node is a valid target) */
  private updateHoverTarget(e: MouseEvent): void {
    const target = e.target as Element;
    const nodeGroup = target.closest('[data-node-id]');
    const id = nodeGroup?.getAttribute('data-node-id') ?? null;
    if (id !== this.hoverTargetId) {
      this.hoverTargetId = id;
      this.hoverTargetType = null;
      if (id && id !== this.sourceNodeId) {
        void getNode(id).then((node) => {
          this.hoverTargetType = node?.type ?? null;
          this.evaluateHover();
        });
      }
    }
    this.evaluateHover();
  }

  private evaluateHover(): void {
    this.hoverValid = true;
    this.hoverType = null;
    if (!this.sourceNodeId || !this.hoverTargetId) return;
    const toId = this.hoverTargetId;
    if (toId === this.sourceNodeId) { this.hoverValid = true; return; }
    if (this.sourceType === null || this.hoverTargetType === null) return; // types not resolved yet
    this.hoverValid = true;
    this.hoverType = getDefaultLinkType(this.sourceType, this.hoverTargetType);
  }

  private async onMouseUp(e: MouseEvent): Promise<void> {
    if (!AppState.get('isLinking') || !this.sourceNodeId) return;
    const target = e.target as Element;
    const nodeGroup = target.closest('[data-node-id]');
    const toNodeId = nodeGroup?.getAttribute('data-node-id') ?? null;

    if (toNodeId && toNodeId !== this.sourceNodeId) {
      const type = getDefaultLinkType();
      await this.finishLink(this.sourceNodeId, toNodeId, type);
    }
    this.cancel();
  }

  private async finishLink(fromId: string, toId: string, type: LinkType): Promise<void> {
    const viewId = this.canvas.viewIdStr;

    // Duplicate guard: refuse to reconnect two nodes that are already
    // linked in this view, regardless of arrow direction.
    const existing = await getLinksInView(viewId);
    const alreadyLinked = existing.some(l =>
      (l.fromNodeId === fromId && l.toNodeId === toId) ||
      (l.fromNodeId === toId && l.toNodeId === fromId)
    );
    if (alreadyLinked) {
      showToast('These two nodes are already connected', 'info');
      return;
    }

    const link = await createLink({ fromNodeId: fromId, toNodeId: toId, viewId, type });

    const fromPos = await getNodePosition(fromId, viewId);
    const toPos = await getNodePosition(toId, viewId);
    if (fromPos && toPos) {
      this.canvas.addLinkRenderer(link, fromPos, toPos);
      UndoManager.execute(makeCommand(
        'Create link',
        // Re-create (used both as no-op first run and by Redo)
        async () => {
          await createLink(link);
          if (!this.canvas.getLinkRenderer(link.id)) {
            this.canvas.addLinkRenderer(link, fromPos, toPos);
          }
        },
        async () => {
          await deleteLink(link.id);
          this.canvas.removeLinkRenderer(link.id);
        }
      ));
    }
  }

  cancel(): void {
    this.sourceNodeId = null;
    this.sourceType = null;
    this.hoverTargetId = null;
    this.hoverTargetType = null;
    this.hoverValid = true;
    this.hoverType = null;
    AppState.set('isLinking', false);
    AppState.set('linkSourceNodeId', null);
    this.canvas.container.style.cursor = '';
    if (this.previewLine) { this.previewLine.remove(); this.previewLine = null; }
  }
}
