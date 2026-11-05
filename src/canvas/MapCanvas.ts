// ============================================================
// CompendiumNG Web — SVG Canvas Engine
// ============================================================

import { Node, Link, NodePosition, View } from '../core/types';
import { AppState } from '../state/AppState';
import { NodeRenderer } from './NodeRenderer';
import { LinkRenderer } from './LinkRenderer';
import { CanvasInteraction } from './CanvasInteraction';
import { LinkDrawer } from './LinkDrawer';
import { getPositionsInView } from '../db/views';
import { getLinksInView } from '../db/links';
import { getNode } from '../db/nodes';
import { NODE_META } from '../core/constants';
import { svgEl } from '../core/utils';

export class MapCanvas {
  container: HTMLElement;
  svg: SVGSVGElement;
  private defs: SVGDefsElement;
  private gridLayer: SVGGElement;
  private linksLayer: SVGGElement;
  private nodesLayer: SVGGElement;
  private overlayLayer: SVGGElement; // for selection box, link-in-progress
  private transform: SVGGElement;    // the zoomable/pannable group

  private viewId: string = '';
  private nodeRenderers = new Map<string, NodeRenderer>();
  private linkRenderers = new Map<string, LinkRenderer>();

  // Stored for screenToCanvas – updated by setTransform()
  _panX = 0;
  _panY = 0;
  _zoom = 1;

  interaction!: CanvasInteraction;
  linkDrawer!: LinkDrawer;

  private onNodeClickCb?: (nodeId: string, e: MouseEvent) => void;
  private onNodeDblClickCb?: (nodeId: string, e: MouseEvent) => void;
  private onCanvasClickCb?: (x: number, y: number, e: MouseEvent) => void;
  private onCanvasRightClickCb?: (x: number, y: number, e: MouseEvent) => void;
  private onNodeRightClickCb?: (nodeId: string, e: MouseEvent) => void;
  private onLinkClickCb?: (linkId: string, e: MouseEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;

    this.svg = svgEl<SVGSVGElement>('svg', { xmlns: 'http://www.w3.org/2000/svg' });
    this.svg.style.position = 'absolute';
    this.svg.style.top = '0';
    this.svg.style.left = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';

    this.defs = svgEl<SVGDefsElement>('defs');
    this.buildDefs();
    this.svg.appendChild(this.defs);

    this.transform = svgEl<SVGGElement>('g', { id: 'canvas-transform' });
    this.gridLayer = svgEl<SVGGElement>('g', { id: 'grid-layer' });
    this.linksLayer = svgEl<SVGGElement>('g', { id: 'links-layer' });
    this.nodesLayer = svgEl<SVGGElement>('g', { id: 'nodes-layer' });
    this.overlayLayer = svgEl<SVGGElement>('g', { id: 'overlay-layer' });

    this.transform.appendChild(this.linksLayer);
    this.transform.appendChild(this.nodesLayer);
    this.transform.appendChild(this.overlayLayer);
    this.svg.appendChild(this.transform);

    container.appendChild(this.svg);

    this.interaction = new CanvasInteraction(this);
    this.linkDrawer = new LinkDrawer(this);
  }

  private buildDefs(): void {
    // Arrow marker
    const marker = svgEl<SVGMarkerElement>('marker', {
      id: 'arrow',
      markerWidth: '10',
      markerHeight: '7',
      refX: '9',
      refY: '3.5',
      orient: 'auto',
    });
    const poly = svgEl<SVGPolygonElement>('polygon', {
      points: '0 0, 10 3.5, 0 7',
      fill: '#64748b',
    });
    marker.appendChild(poly);
    this.defs.appendChild(marker);

    // Arrow marker variants for each link color
    const colors: Record<string, string> = {
      'arrow-green': '#10b981',
      'arrow-red': '#f43f5e',
      'arrow-blue': '#0ea5e9',
      'arrow-orange': '#f97316',
      'arrow-purple': '#a855f7',
    };
    for (const [id, fill] of Object.entries(colors)) {
      const m = svgEl<SVGMarkerElement>('marker', {
        id,
        markerWidth: '10', markerHeight: '7',
        refX: '9', refY: '3.5', orient: 'auto',
      });
      const p = svgEl<SVGPolygonElement>('polygon', { points: '0 0, 10 3.5, 0 7', fill });
      m.appendChild(p);
      this.defs.appendChild(m);
    }

    // Drop shadow filter for selected nodes
    const filter = svgEl<SVGFilterElement>('filter', { id: 'shadow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    const feDropShadow = svgEl('feDropShadow', {
      dx: '0', dy: '2', stdDeviation: '4',
      'flood-color': 'rgba(0,0,0,0.5)',
    });
    filter.appendChild(feDropShadow);
    this.defs.appendChild(filter);
  }

  async loadView(viewId: string, view: View): Promise<void> {
    this.viewId = viewId;
    this.clear();

    // Apply saved pan/zoom (sync interaction state AND the SVG transform group)
    this.interaction.setTransformExternal(view.panX, view.panY, view.zoom);

    // Load positions and nodes
    const positions = await getPositionsInView(viewId);
    const nodes: Array<{ node: Node; pos: NodePosition }> = [];
    for (const pos of positions) {
      const node = await getNode(pos.nodeId);
      if (node) nodes.push({ node, pos });
    }

    // Load links
    const links = await getLinksInView(viewId);
    const fromNodes = new Map(nodes.map(n => [n.node.id, n]));

    // Render links first (so nodes appear on top)
    for (const link of links) {
      const fromPos = fromNodes.get(link.fromNodeId)?.pos;
      const toPos = fromNodes.get(link.toNodeId)?.pos;
      if (fromPos && toPos) {
        this.addLinkRenderer(link, fromPos, toPos);
      }
    }

    // Render nodes
    for (const { node, pos } of nodes) {
      this.addNodeRenderer(node, pos);
    }
  }

  addNodeRenderer(node: Node, pos: NodePosition): NodeRenderer {
    const nr = new NodeRenderer(node, pos, this);
    this.nodeRenderers.set(node.id, nr);
    this.nodesLayer.appendChild(nr.group);
    return nr;
  }

  updateNodeRenderer(nodeId: string, node: Node): void {
    this.nodeRenderers.get(nodeId)?.update(node);
  }

  removeNodeRenderer(nodeId: string): void {
    const nr = this.nodeRenderers.get(nodeId);
    if (nr) {
      nr.group.remove();
      this.nodeRenderers.delete(nodeId);
    }
  }

  addLinkRenderer(link: Link, fromPos: NodePosition, toPos: NodePosition): LinkRenderer {
    const lr = new LinkRenderer(link, fromPos, toPos, this);
    this.linkRenderers.set(link.id, lr);
    this.linksLayer.appendChild(lr.group);
    return lr;
  }

  getLinkRenderer(linkId: string): LinkRenderer | undefined {
    return this.linkRenderers.get(linkId);
  }

  removeLinkRenderer(linkId: string): void {
    const lr = this.linkRenderers.get(linkId);
    if (lr) {
      lr.group.remove();
      this.linkRenderers.delete(linkId);
    }
  }

  updateLinkPositions(nodeId: string): void {
    for (const [, lr] of this.linkRenderers) {
      if (lr.link.fromNodeId === nodeId || lr.link.toNodeId === nodeId) {
        const fromNr = this.nodeRenderers.get(lr.link.fromNodeId);
        const toNr = this.nodeRenderers.get(lr.link.toNodeId);
        if (fromNr && toNr) lr.updatePositions(fromNr.pos, toNr.pos);
      }
    }
  }

  /** Re-reads the connected node positions for a single link (e.g. after reversing it) */
  refreshLinkPosition(linkId: string): void {
    const lr = this.linkRenderers.get(linkId);
    if (!lr) return;
    const fromNr = this.nodeRenderers.get(lr.link.fromNodeId);
    const toNr = this.nodeRenderers.get(lr.link.toNodeId);
    if (fromNr && toNr) lr.updatePositions(fromNr.pos, toNr.pos);
  }

  setTransform(panX: number, panY: number, zoom: number): void {
    this._panX = panX;
    this._panY = panY;
    this._zoom = zoom;
    this.transform.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
  }

  screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    // Delegate to interaction which owns pan/zoom state
    if (this.interaction) return this.interaction.screenToCanvas(screenX, screenY);
    // Fallback before interaction is set up
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (screenX - rect.left - this._panX) / this._zoom,
      y: (screenY - rect.top  - this._panY) / this._zoom,
    };
  }

  getNodeRenderer(nodeId: string): NodeRenderer | undefined {
    return this.nodeRenderers.get(nodeId);
  }

  get allNodeRenderers(): Map<string, NodeRenderer> {
    return this.nodeRenderers;
  }

  get overlayLayerEl(): SVGGElement { return this.overlayLayer; }
  get viewIdStr(): string { return this.viewId; }

  refreshNodeSelection(): void {
    const sel = AppState.get('selection');
    for (const [id, nr] of this.nodeRenderers) {
      nr.setSelected(sel.nodeIds.has(id));
    }
    for (const [id, lr] of this.linkRenderers) {
      lr.setSelected(sel.linkIds.has(id));
    }
  }

  clear(): void {
    this.nodeRenderers.clear();
    this.linkRenderers.clear();
    this.nodesLayer.innerHTML = '';
    this.linksLayer.innerHTML = '';
    this.overlayLayer.innerHTML = '';
  }

  destroy(): void {
    this.interaction.destroy();
    this.svg.remove();
  }

  // --------------- Event Handlers ---------------

  onNodeClick(cb: (nodeId: string, e: MouseEvent) => void): void { this.onNodeClickCb = cb; }
  onNodeDblClick(cb: (nodeId: string, e: MouseEvent) => void): void { this.onNodeDblClickCb = cb; }
  onCanvasClick(cb: (x: number, y: number, e: MouseEvent) => void): void { this.onCanvasClickCb = cb; }
  onCanvasRightClick(cb: (x: number, y: number, e: MouseEvent) => void): void { this.onCanvasRightClickCb = cb; }
  onNodeRightClick(cb: (nodeId: string, e: MouseEvent) => void): void { this.onNodeRightClickCb = cb; }
  onLinkClick(cb: (linkId: string, e: MouseEvent) => void): void { this.onLinkClickCb = cb; }

  _fireNodeClick(nodeId: string, e: MouseEvent): void { this.onNodeClickCb?.(nodeId, e); }
  _fireNodeDblClick(nodeId: string, e: MouseEvent): void { this.onNodeDblClickCb?.(nodeId, e); }
  _fireCanvasClick(x: number, y: number, e: MouseEvent): void { this.onCanvasClickCb?.(x, y, e); }
  _fireCanvasRightClick(x: number, y: number, e: MouseEvent): void { this.onCanvasRightClickCb?.(x, y, e); }
  _fireNodeRightClick(nodeId: string, e: MouseEvent): void { this.onNodeRightClickCb?.(nodeId, e); }
  _fireLinkClick(linkId: string, e: MouseEvent): void { this.onLinkClickCb?.(linkId, e); }
}
