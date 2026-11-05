// CompendiumNG Web — SVG Exporter
import { downloadText } from '../../core/utils';

export function exportMapSVG(svgElement: SVGSVGElement, filename = 'compendium_map.svg'): void {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  // Add background rect
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  // Embed fonts note
  const svgText = new XMLSerializer().serializeToString(clone);
  downloadText(svgText, filename, 'image/svg+xml');
}
