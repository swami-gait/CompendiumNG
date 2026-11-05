// ============================================================
// CompendiumNG Web — Node SVG Renderer
// ============================================================

import { Node, NodePosition } from '../core/types';
import { NodeType } from '../core/types';
import { NODE_META, NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT } from '../core/constants';
import { svgEl, wrapLabel } from '../core/utils';
import type { MapCanvas } from './MapCanvas';

export class NodeRenderer {
  node: Node;
  pos: NodePosition;
  group: SVGGElement;
  private canvas: MapCanvas;
  private shapeEl!: SVGElement;
  private labelEl!: SVGTextElement;
  private iconEl!: SVGTextElement;
  private viewBadge!: SVGGElement;
  /** Inner wrapper that receives the pop-in animation (keeps transform attr on outer group intact) */
  private inner!: SVGGElement;
  private selected = false;

  constructor(node: Node, pos: NodePosition, canvas: MapCanvas) {
    this.node = node;
    this.pos = pos;
    this.canvas = canvas;
    this.group = svgEl<SVGGElement>('g', {
      'data-node-id': node.id,
      class: 'node-group',
      style: 'cursor:pointer',
    });
    this.build();
    this.setPosition(pos.x, pos.y);
    this.attachEvents();
  }

  private build(): void {
    this.group.innerHTML = '';
    // Inner wrapper group: all visual children go here; the outer group keeps
    // its positioning transform attribute, the pop-in animation lives on the
    // inner group (CSS transform animations would otherwise override the
    // positioning transform attribute and pin the node at the canvas origin).
    this.inner = svgEl<SVGGElement>('g', { class: 'node-inner' });
    const meta = NODE_META[this.node.type];
    const w = this.pos.width || NODE_DEFAULT_WIDTH;
    const h = this.pos.height || NODE_DEFAULT_HEIGHT;
    const cx = w / 2, cy = h / 2;

    // Shape
    switch (meta.svgShape) {
      case 'diamond': {
        const hw = w / 2, hh = h / 2;
        this.shapeEl = svgEl<SVGPolygonElement>('polygon', {
          points: `${cx},0 ${w},${cy} ${cx},${h} 0,${cy}`,
          fill: meta.color,
          stroke: meta.borderColor,
          'stroke-width': '2',
          rx: '4',
        });
        break;
      }
      case 'circle': {
        const r = Math.min(w, h) / 2;
        this.shapeEl = svgEl<SVGCircleElement>('circle', {
          cx: String(cx), cy: String(cy), r: String(r),
          fill: meta.color, stroke: meta.borderColor, 'stroke-width': '2',
        });
        break;
      }
      case 'hexagon': {
        const r = Math.min(w, h) / 2;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
        }).join(' ');
        this.shapeEl = svgEl<SVGPolygonElement>('polygon', {
          points: pts,
          fill: meta.color, stroke: meta.borderColor, 'stroke-width': '2',
        });
        break;
      }
      default: {
        const radius = meta.svgShape === 'rounded-rect' ? '8' : '4';
        this.shapeEl = svgEl<SVGRectElement>('rect', {
          x: '0', y: '0', width: String(w), height: String(h),
          rx: radius, ry: radius,
          fill: meta.color, stroke: meta.borderColor, 'stroke-width': '2',
        });
      }
    }
    this.inner.appendChild(this.shapeEl);

    // Icon — Map nodes draw a mini-network glyph (three dots joined by
    // lines, like the original Compendium "map view" icon); other types
    // use their text glyph.
    if (this.node.type === NodeType.MAP) {
      this.iconEl = null as unknown as SVGTextElement;
      const g = svgEl<SVGGElement>('g', {
        transform: `translate(${cx - 10},${cy - 17})`,
        style: 'pointer-events:none; user-select:none;',
      });
      const dot = (x: number, y: number) => svgEl<SVGCircleElement>('circle', {
        cx: String(x), cy: String(y), r: '2.6',
        fill: meta.textColor,
      });
      const line = (x1: number, y1: number, x2: number, y2: number) => svgEl<SVGLineElement>('line', {
        x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
        stroke: meta.textColor, 'stroke-width': '1.1',
      });
      g.appendChild(line(3.5, 4, 10, 11));
      g.appendChild(line(10, 11, 16.5, 4));
      g.appendChild(line(3.5, 4, 16.5, 4));
      g.appendChild(dot(3.5, 4));
      g.appendChild(dot(10, 11));
      g.appendChild(dot(16.5, 4));
      this.inner.appendChild(g);
    } else {
      this.iconEl = svgEl<SVGTextElement>('text', {
        x: String(cx), y: String(cy - 10),
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: meta.textColor,
        'font-size': '16',
        'font-family': 'Inter, sans-serif',
        style: 'pointer-events:none; user-select:none;',
      });
      this.iconEl.textContent = meta.icon;
      this.inner.appendChild(this.iconEl);
    }

    // Label
    this.labelEl = svgEl<SVGTextElement>('text', {
      x: String(cx),
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: meta.textColor,
      'font-size': '11',
      'font-family': 'Inter, sans-serif',
      'font-weight': '500',
      style: 'pointer-events:none; user-select:none;',
    });
    this.renderLabel();
    this.inner.appendChild(this.labelEl);

    // Selection ring (initially hidden)
    const selRing = svgEl<SVGRectElement>('rect', {
      class: 'selection-ring',
      x: '-4', y: '-4',
      width: String(w + 8), height: String(h + 8),
      rx: '10', ry: '10',
      fill: 'none', stroke: '#0ea5e9',
      'stroke-width': '2',
      'stroke-dasharray': '4 2',
      opacity: '0',
    });
    this.inner.appendChild(selRing);

    // Connector ports (shown on hover)
    const ports = [
      { x: cx, y: 0 }, { x: w, y: cy }, { x: cx, y: h }, { x: 0, y: cy },
    ];
    for (const p of ports) {
      // Oversized invisible hit area so the interactive zone is much
      // larger than the visible dot (fewer missed clicks, no accidental drags).
      const hit = svgEl<SVGCircleElement>('circle', {
        cx: String(p.x), cy: String(p.y), r: '12',
        fill: 'transparent', // must receive events (fill:none would not)
        class: 'connector-port connector-port-hit',
        style: 'opacity:0; stroke:none; cursor:crosshair',
        'data-node-id': this.node.id,
      });
      this.inner.appendChild(hit);
      const port = svgEl<SVGCircleElement>('circle', {
        cx: String(p.x), cy: String(p.y), r: '5',
        fill: '#0ea5e9', stroke: '#fff', 'stroke-width': '1.5',
        class: 'connector-port',
        style: 'opacity:0; transition:opacity 0.15s; cursor:crosshair',
        'data-node-id': this.node.id,
      });
      this.inner.appendChild(port);
    }

    this.group.appendChild(this.inner);
  }

  /** Renders the node label wrapped over up to two lines */
  private renderLabel(): void {
    const w = this.pos.width || NODE_DEFAULT_WIDTH;
    const h = this.pos.height || NODE_DEFAULT_HEIGHT;
    const cy = h / 2;
    const lines = wrapLabel(this.node.label, 24, 2);
    this.labelEl.textContent = '';
    const lineH = 13;
    const startY = lines.length === 1 ? cy + 12 : cy + 6;
    for (const [i, line] of lines.entries()) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      t.setAttribute('x', String(w / 2));
      t.setAttribute('y', String(startY + i * lineH));
      t.textContent = line;
      this.labelEl.appendChild(t);
    }
  }

  update(node: Node): void {
    this.node = node;
    const meta = NODE_META[node.type];
    this.renderLabel();
    if (this.iconEl) {
      this.iconEl.textContent = meta.icon;
      this.iconEl.setAttribute('fill', meta.textColor);
    }
    // Update colours
    (this.shapeEl as SVGElement).setAttribute('fill', meta.color);
    (this.shapeEl as SVGElement).setAttribute('stroke', meta.borderColor);
    this.labelEl.setAttribute('fill', meta.textColor);
  }

  setPosition(x: number, y: number): void {
    this.pos = { ...this.pos, x, y };
    this.group.setAttribute('transform', `translate(${x},${y})`);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    const ring = this.group.querySelector('.selection-ring') as SVGElement;
    if (ring) ring.setAttribute('opacity', selected ? '1' : '0');
    if (selected) {
      this.group.setAttribute('filter', 'url(#shadow)');
    } else {
      this.group.removeAttribute('filter');
    }
  }

  private attachEvents(): void {
    this.group.addEventListener('mouseenter', () => {
      // Show connector ports
      this.group.querySelectorAll('.connector-port').forEach(p =>
        (p as SVGElement).style.opacity = '1'
      );
    });
    this.group.addEventListener('mouseleave', () => {
      this.group.querySelectorAll('.connector-port').forEach(p =>
        (p as SVGElement).style.opacity = '0'
      );
    });
    this.group.addEventListener('click', (e) => {
      e.stopPropagation();
      this.canvas._fireNodeClick(this.node.id, e as MouseEvent);
    });
    this.group.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.canvas._fireNodeDblClick(this.node.id, e as MouseEvent);
    });
    this.group.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.canvas._fireNodeRightClick(this.node.id, e as MouseEvent);
    });
  }

  /** Animate the node popping into existence */
  animateIn(): void {
    this.inner.style.animation = 'nodePop 0.25s ease forwards';
  }
}
