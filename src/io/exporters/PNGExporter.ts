// CompendiumNG Web — PNG Exporter
import { downloadBlob } from '../../core/utils';

export async function exportMapPNG(
  svgElement: SVGSVGElement,
  filename = 'compendium_map.png',
  scale = 2
): Promise<void> {
  const rect = svgElement.getBoundingClientRect();
  const width = rect.width * scale;
  const height = rect.height * scale;

  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.width = width;
  img.height = height;

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (blob) { downloadBlob(blob, filename); resolve(); }
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}
