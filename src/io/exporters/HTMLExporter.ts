// ============================================================
// CompendiumNG Web — HTML Outline Exporter
// ============================================================

import { Node } from '../../core/types';
import { NODE_META, nodeIconHtml } from '../../core/constants';
import { getPositionsInView } from '../../db/views';
import { getLinksInView } from '../../db/links';
import { getNode } from '../../db/nodes';
import { downloadText } from '../../core/utils';

function stripHtmlLocal(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
}

export async function exportHTMLOutline(viewId: string, viewLabel: string): Promise<void> {
  const positions = await getPositionsInView(viewId);
  const nodes: Node[] = [];
  for (const pos of positions) {
    const n = await getNode(pos.nodeId);
    if (n) nodes.push(n);
  }
  const links = await getLinksInView(viewId);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${viewLabel} — CompendiumNG Web</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  body{font-family:Inter,sans-serif;background:#0d1117;color:#e6edf3;padding:2rem;max-width:900px;margin:0 auto;line-height:1.6;}
  h1{color:#0ea5e9;font-size:1.75rem;margin-bottom:0.25rem;}
  .meta{color:#6e7681;font-size:0.8rem;margin-bottom:2rem;}
  .node{margin:1rem 0;padding:1rem 1.25rem;border-radius:10px;border:1px solid #30363d;background:#161b22;transition:border-color 0.2s;}
  .node:hover{border-color:#444c56;}
  .node-type{font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;opacity:0.8;margin-bottom:0.25rem;}
  .node-label{font-size:1.05rem;font-weight:600;margin:0;}
  .node-detail{font-size:0.875rem;color:#8b949e;margin-top:0.5rem;}
  .node-url{margin-top:0.5rem;font-size:0.8rem;}
  .node-url a{color:#58a6ff;}
  .links-section{margin-top:0.5rem;font-size:0.75rem;color:#6e7681;}
  hr{border:none;border-top:1px solid #21262d;margin:1.5rem 0;}
</style>
</head>
<body>
<h1>🗺 ${viewLabel}</h1>
<p class="meta">Exported from CompendiumNG Web on ${new Date().toLocaleDateString('en-US', { year:'numeric',month:'long',day:'numeric' })}</p>
<hr>
`;

  for (const node of nodes) {
    const meta = NODE_META[node.type];
    const nodeLinks = links.filter(l => l.fromNodeId === node.id || l.toNodeId === node.id);
    const detailText = stripHtmlLocal(node.detail);
    html += `<div class="node">
  <div class="node-type" style="color:${meta.borderColor}">${nodeIconHtml(node.type)} ${meta.label}</div>
  <p class="node-label">${node.label}</p>
  ${detailText ? `<p class="node-detail">${detailText.substring(0, 300)}${detailText.length > 300 ? '…' : ''}</p>` : ''}
  ${node.referenceURL ? `<div class="node-url">🔗 <a href="${node.referenceURL}" target="_blank" rel="noopener">${node.referenceURL}</a></div>` : ''}
  ${nodeLinks.length > 0 ? `<div class="links-section">Connected to ${nodeLinks.length} other node${nodeLinks.length !== 1 ? 's' : ''}</div>` : ''}
</div>
`;
  }

  html += '</body></html>';
  downloadText(html, `${viewLabel.replace(/[^a-z0-9]/gi, '_')}_outline.html`, 'text/html');
}
