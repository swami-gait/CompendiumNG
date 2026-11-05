// ============================================================
// CompendiumNG Web — Link (Arrow) SVG Renderer
// ============================================================

import { Link, NodePosition } from '../core/types';
import { LINK_META } from '../core/constants';
import { svgEl, getEdgePoint, getBezierControlPoints, arrowHeadPoints } from '../core/utils';
import type { MapCanvas } from './MapCanvas';

export class LinkRenderer {
  link: Link;
  group: SVGGElement;
  private canvas: MapCanvas;
  private pathEl!: SVGPathElement;
  private arrowEl!: SVGPolygonElement;
  private arrowElReverse: SVGPolygonElement | null = null;
  private labelEl!: SVGTextElement;
  private hitEl!: SVGPathElement;  // wider transparent path for click detection
  private fromPos: NodePosition;
  private toPos: NodePosition;

  constructor(link: Link, fromPos: NodePosition, toPos: NodePosition, canvas: MapCanvas) {
    this.link = link;
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.canvas = canvas;
    this.group = svgEl<SVGGElement>('g', {
      'data-link-id': link.id,
      class: 'link-group',
    });
    this.build();
    this.attachEvents();
  }

  private build(): void {
    this.group.innerHTML = '';
    const meta = LINK_META[this.link.type];
    const color = this.link.color ?? meta.color;
    const dashArray = this.link.style === 'dashed' ? '6 4' : 'none';

    const from = this.getFrom();
    const to = this.getTo();
    const { cp1, cp2 } = getBezierControlPoints(from, to);
    const d = `M${from.x},${from.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${to.x},${to.y}`;

    // Hit area (wider, transparent)
    this.hitEl = svgEl<SVGPathElement>('path', {
      d, fill: 'none', stroke: 'transparent', 'stroke-width': '16',
      style: 'cursor:pointer',
    });
    this.group.appendChild(this.hitEl);

    // Visible path
    this.pathEl = svgEl<SVGPathElement>('path', {
      d, fill: 'none', stroke: color, 'stroke-width': '1.5',
      'stroke-dasharray': dashArray,
      'stroke-linecap': 'round',
    });
    this.group.appendChild(this.pathEl);

    // Arrow head(s) — direction style per link.arrowHead:
    //   'arrow' → single head at the target end (default),
    //   'both'  → heads at both ends,
    //   'none'  → plain connector line
    const tipPt = to;
    const prevPt = { x: cp2.x, y: cp2.y };
    this.arrowEl = svgEl<SVGPolygonElement>('polygon', {
      points: arrowHeadPoints(tipPt, prevPt, 9),
      fill: color,
      style: 'pointer-events:none',
    });
    if (this.link.arrowHead !== 'none') {
      this.group.appendChild(this.arrowEl);
    }
    if (this.link.arrowHead === 'both') {
      this.arrowElReverse = svgEl<SVGPolygonElement>('polygon', {
        points: arrowHeadPoints(from, { x: cp1.x, y: cp1.y }, 9),
        fill: color,
        style: 'pointer-events:none',
      });
      this.group.appendChild(this.arrowElReverse);
    }

    // Label — custom label when set, otherwise the link-type verb
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - 8;
    this.labelEl = svgEl<SVGTextElement>('text', {
      x: String(midX), y: String(midY),
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: color, 'font-size': '10', 'font-family': 'Inter, sans-serif',
      opacity: this.link.label ? '1' : '0.65',
      style: 'pointer-events:none; user-select:none;',
    });
    this.labelEl.textContent = this.link.label || meta.label;
    this.group.appendChild(this.labelEl);
  }

  /** Re-renders the link after its properties (type/label/arrowHead) change */
  update(link: Link): void {
    this.link = link;
    this.build();
    this.attachEvents();
  }

  updatePositions(fromPos: NodePosition, toPos: NodePosition): void {
    this.fromPos = fromPos;
    this.toPos = toPos;
    const from = this.getFrom();
    const to = this.getTo();
    const { cp1, cp2 } = getBezierControlPoints(from, to);
    const d = `M${from.x},${from.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${to.x},${to.y}`;
    this.pathEl.setAttribute('d', d);
    this.hitEl.setAttribute('d', d);
    this.arrowEl.setAttribute('points', arrowHeadPoints(to, { x: cp2.x, y: cp2.y }, 9));
    // Keep the reverse arrowhead (double-headed links) tracking the geometry
    this.arrowElReverse?.setAttribute('points', arrowHeadPoints(from, { x: cp1.x, y: cp1.y }, 9));
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - 8;
    this.labelEl.setAttribute('x', String(midX));
    this.labelEl.setAttribute('y', String(midY));
  }

  setSelected(selected: boolean): void {
    const meta = LINK_META[this.link.type];
    const color = this.link.color ?? meta.color;
    if (selected) {
      this.pathEl.setAttribute('stroke-width', '3');
      this.pathEl.setAttribute('stroke', '#0ea5e9');
      this.arrowEl.setAttribute('fill', '#0ea5e9');
    } else {
      this.pathEl.setAttribute('stroke-width', '1.5');
      this.pathEl.setAttribute('stroke', color);
      this.arrowEl.setAttribute('fill', color);
    }
  }

  private getFrom() {
    const fp = this.fromPos;
    const tp = this.toPos;
    return getEdgePoint(
      { x: fp.x, y: fp.y, width: fp.width, height: fp.height },
      { x: tp.x + tp.width / 2, y: tp.y + tp.height / 2 }
    );
  }

  private getTo() {
    const fp = this.fromPos;
    const tp = this.toPos;
    return getEdgePoint(
      { x: tp.x, y: tp.y, width: tp.width, height: tp.height },
      { x: fp.x + fp.width / 2, y: fp.y + fp.height / 2 }
    );
  }

  private attachEvents(): void {
    this.hitEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.canvas._fireLinkClick(this.link.id, e as MouseEvent);
    });
  }
}
