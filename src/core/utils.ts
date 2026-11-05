// ============================================================
// CompendiumNG Web — Utility Functions
// ============================================================

// --------------- ID Generation ---------------

export function generateId(): string {
  // UUID v4 using crypto API
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --------------- Date / Time ---------------

export function now(): number {
  return Date.now();
}

export function formatDate(epoch: number): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epoch));
}

export function formatDateShort(epoch: number): string {
  const d = new Date(epoch);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --------------- String helpers ---------------

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '…';
}

/** Word-wraps a label for display on a node: at most maxLines lines of <=maxChars chars */
export function wrapLabel(text: string, maxChars = 24, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (lines.length >= maxLines) break;
    if (cur.length + w.length + 1 <= maxChars || !cur) {
      cur = cur ? `${cur} ${w}` : w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Clamp overlong single words
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].length > maxChars) lines[k] = truncate(lines[k], maxChars - 1);
  }

  // Was the whole text shown? otherwise ellipsis the last line
  const shown = lines.join(' ');
  if (shown.length < text.trim().length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = truncate(last, maxChars - 1);
  }
  return lines;
}

export function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --------------- Math / Geometry ---------------

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/** Get the midpoint of a rect edge closest to a target point */
export function getEdgePoint(rect: Rect, target: Point): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const scaleX = dx !== 0 ? (rect.width / 2) / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? (rect.height / 2) / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Compute bezier control points for a smooth curved link */
export function getBezierControlPoints(
  from: Point,
  to: Point
): { cp1: Point; cp2: Point } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const curvature = 0.4;
  return {
    cp1: { x: from.x + dx * curvature, y: from.y },
    cp2: { x: to.x - dx * curvature, y: to.y },
  };
}

/** Arrow head polygon points for SVG */
export function arrowHeadPoints(
  tip: Point,
  from: Point,
  size = 10
): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const a1 = angle - Math.PI / 6;
  const a2 = angle + Math.PI / 6;
  const p1 = { x: tip.x - size * Math.cos(a1), y: tip.y - size * Math.sin(a1) };
  const p2 = { x: tip.x - size * Math.cos(a2), y: tip.y - size * Math.sin(a2) };
  return `${tip.x},${tip.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`;
}

// --------------- DOM Helpers ---------------

export function el<T extends HTMLElement = HTMLElement>(
  tag: string,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): T {
  const element = document.createElement(tag) as T;
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'class') element.className = val;
    else element.setAttribute(key, val);
  }
  for (const child of children) {
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else element.appendChild(child);
  }
  return element;
}

export function svgEl<T extends SVGElement = SVGElement>(
  tag: string,
  attrs: Record<string, string | number> = {}
): T {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag) as T;
  for (const [key, val] of Object.entries(attrs)) {
    element.setAttribute(key, String(val));
  }
  return element;
}

export function qs<T extends Element = Element>(
  selector: string,
  parent: Element | Document = document
): T | null {
  return parent.querySelector<T>(selector);
}

export function qsa<T extends Element = Element>(
  selector: string,
  parent: Element | Document = document
): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

/** Show/hide an element */
export function setVisible(el: HTMLElement, visible: boolean): void {
  el.style.display = visible ? '' : 'none';
}

/** Emit a custom DOM event */
export function emit(
  target: EventTarget,
  name: string,
  detail?: unknown
): void {
  target.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

// --------------- Color Utilities ---------------

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --------------- File download helper ---------------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string, mimeType = 'text/plain'): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}
