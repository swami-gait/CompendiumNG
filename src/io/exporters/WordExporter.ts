// ============================================================
// CompendiumNG Web — Word Report Exporter
//
// Produces a genuine .docx (Office Open XML) document that reads
// as a standalone written report of the thinking captured on the
// maps. It follows the intent of the original Compendium "Export
// to Word" feature: a proper Word document built on Word's own
// template styles — not a node dump and not HTML pretending to
// be a document.
//
//   · Real Word styles throughout: Title, Subtitle, Heading 1-3,
//     lists, hyperlinks — restyleable from Word's style gallery
//   · Cover: title, by-line, date, auto-updating table of contents
//   · Each map is a chapter (Heading 1); sub-maps become chapters
//   · Questions are section headings, phrased as asked (Heading 2)
//   · Ideas are subsections (Heading 3); notes become body text
//   · Argumentation reads as narrative ("Supporting considerations:",
//     "Points raised against it:") with the reasoning as bullets
//   · Decisions read in-line; references become live hyperlinks
//   · No IBIS icons, node-type badges, meta tables or jargon —
//     someone who has never heard of Compendium or IBIS can read
//     and share it as an ordinary report
// ============================================================

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx';

import { Node, NodeType, Link, Project } from '../../core/types';
import { getPositionsInView } from '../../db/views';
import { getLinksInView } from '../../db/links';
import { getNode } from '../../db/nodes';
import { downloadBlob } from '../../core/utils';

const CONTAINER_TYPES: NodeType[] = [NodeType.MAP, NodeType.LIST];

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
];

const headingFor = (level: number) => HEADING_LEVELS[Math.min(level, 5) - 1];

// ─── helpers ─────────────────────────────────────────────────

/** Drops executable payloads from contenteditable notes before embedding */
function sanitizeDetailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/ on\w+="[^"]*"/gi, '');
}

/** True when link connects exactly the two node ids (either direction) */
const pairOf = (l: Link, a: string, b: string) =>
  (l.fromNodeId === a && l.toNodeId === b) || (l.fromNodeId === b && l.toNodeId === a);

type MapData = { nodes: Node[]; links: Link[] };

async function loadViewData(viewId: string): Promise<MapData> {
  const positions = await getPositionsInView(viewId);
  // Visual reading order: top-to-bottom, left-to-right
  positions.sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.nodeId < b.nodeId ? -1 : 1));
  const nodes: Node[] = [];
  for (const pos of positions) {
    const n = await getNode(pos.nodeId);
    if (n) nodes.push(n);
  }
  const links = await getLinksInView(viewId);
  return { nodes, links };
}

// ─── rich-note HTML → Word paragraphs ─────────────────────────
//
// Notes are authored as rich HTML in the app. They are converted
// to ordinary Word paragraphs (bold, italic, bullets, numbered
// lists, hyperlinks) so they blend into the body text like any
// other writing.

type Fmt = { bold: boolean; italic: boolean };

function inlineRuns(
  source: ChildNode,
  fmt: Fmt,
  charStyle?: string,
): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === 3) {                    // text
      const text = (child.textContent ?? '').replace(/\s+/g, ' ');
      if (text) {
        runs.push(new TextRun({
          text,
          bold: fmt.bold || undefined,
          italics: fmt.italic || undefined,
          style: charStyle,
        }));
      }
      continue;
    }
    if (child.nodeType !== 1) continue;            // element
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') continue;
    if (tag === 'br') {
      runs.push(new TextRun({ break: 1 }));
      continue;
    }
    if (tag === 'a' && el.getAttribute('href')) {
      runs.push(new ExternalHyperlink({
        link: el.getAttribute('href') as string,
        children: inlineRuns(el, { ...fmt, italic: false }, 'Hyperlink'),
      }));
      continue;
    }
    runs.push(...inlineRuns(child, {
      bold:   fmt.bold   || tag === 'b' || tag === 'strong',
      italic: fmt.italic || tag === 'i' || tag === 'em',
    }, charStyle));
  }
  return runs;
}

function emitList(list: Element, ordered: boolean, out: Paragraph[], level: number): void {
  for (const li of Array.from(list.children)) {
    const tag = li.tagName.toLowerCase();
    if (tag !== 'li') {
      if (tag === 'ul' || tag === 'ol') emitList(li, ordered, out, level);
      continue;
    }
    // Text of this item, excluding nested lists (emitted separately)
    const clone = li.cloneNode(true) as Element;
    clone.querySelectorAll('ul,ol').forEach(n => n.remove());
    const runs = inlineRuns(clone, { bold: false, italic: false });
    out.push(new Paragraph({
      ...(ordered
        ? { numbering: { reference: 'report-ordered', level: Math.min(level, 3) } }
        : { bullet: { level: Math.min(level, 3) } }),
      children: runs.length ? runs : [new TextRun({ text: '' })],
    }));
    for (const nested of Array.from(li.children)) {
      const nestedTag = nested.tagName.toLowerCase();
      if (nestedTag === 'ul' || nestedTag === 'ol') {
        emitList(nested, nestedTag === 'ol', out, level + 1);
      }
    }
  }
}

/** Converts a rich-HTML note into Word paragraphs.
 *  plain:  base indent for plain paragraphs (bullets keep their own)
 *  italic: whether plain paragraphs (and their runs) read as italic */
function htmlToParagraphs(html: string, opts?: { indentLeft?: number; italic?: boolean }): Paragraph[] {
  if (!html || !html.trim()) return [];
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const out: Paragraph[] = [];
  processBlocks(dom.body, out, opts?.indentLeft ?? 0, opts?.italic ?? false);
  return out;
}

function processBlocks(container: Element, out: Paragraph[], indentLeft: number, italic: boolean): void {
  const indent = indentLeft ? { indent: { left: indentLeft } } : {};
  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === 3) {                    // loose text
      const text = (child.textContent ?? '').trim();
      if (text) {
        out.push(new Paragraph({
          ...indent,
          children: inlineRuns(child, { bold: false, italic }),
        }));
      }
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      emitList(el, tag === 'ol', out, 0);
    } else if (tag === 'p' || /^h[1-6]$/.test(tag)) {
      const heading = /^h[1-6]$/.test(tag);
      const runs = inlineRuns(el, { bold: heading, italic });
      if (runs.length) out.push(new Paragraph({ ...indent, children: runs }));
    } else if (tag === 'br') {
      out.push(new Paragraph({ ...indent, children: [] }));
    } else if (tag === 'blockquote') {
      const runs = inlineRuns(el, { bold: false, italic: true });
      if (runs.length) {
        out.push(new Paragraph({ children: runs, indent: { left: 720 + indentLeft } }));
      }
    } else {
      processBlocks(el, out, indentLeft, italic);   // div / section / span wrapper
    }
  }
}

// ─── reusable paragraph builders ──────────────────────────────

/** "See: …" trailing reference, as a live hyperlink */
function seeLink(node: Node): ExternalHyperlink | null {
  if (!node.referenceURL) return null;
  const label = node.referenceLabel || node.referenceURL;
  return new ExternalHyperlink({
    link: node.referenceURL,
    children: [new TextRun({ text: label, style: 'Hyperlink' })],
  });
}

function seeParagraph(node: Node, indent = 0): Paragraph | null {
  const link = seeLink(node);
  if (!link) return null;
  return new Paragraph({
    children: [new TextRun({ text: 'See: ', color: '888888' }), link],
    ...(indent ? { indent: { left: indent } } : {}),
  });
}

/** An argument reads as a bullet, with its notes indented beneath it */
function argumentParagraphs(node: Node): Paragraph[] {
  const out: Paragraph[] = [];
  const link = seeLink(node);
  out.push(new Paragraph({
    bullet: { level: 0 },
    children: [
      new TextRun({ text: node.label, bold: true }),
      ...(link ? [new TextRun({ text: ' — ' }), link] : []),
    ],
  }));
  for (const p of htmlToParagraphs(sanitizeDetailHtml(node.detail), { indentLeft: 720 })) {
    out.push(p);
  }
  return out;
}

/** A decision reads as an in-line statement in plain language */
function decisionParagraphs(node: Node): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({
    children: [
      new TextRun({ text: 'Decision: ', bold: true }),
      new TextRun(node.label),
    ],
  }));
  for (const p of htmlToParagraphs(sanitizeDetailHtml(node.detail))) out.push(p);
  return out;
}

// ─── narrative rendering of one map ───────────────────────────

interface Ctx {
  consumed: Set<string>;
  exportedViews: Map<string, string>;   // viewId → chapter title already used
}

/**
 * Renders one map as a report chapter (a list of paragraphs).
 * Map/List nodes recurse as lower-level chapters; everything
 * else is woven into the running narrative of the thinking.
 */
async function renderChapter(
  viewId: string,
  chapterTitle: string,
  chapterLevel: number,        // 1..5 → Word Heading 1..5
  data: MapData,
  ctx: Ctx,
): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  out.push(new Paragraph({ text: chapterTitle, heading: headingFor(chapterLevel) }));

  const questionIds = new Set(data.nodes.filter(n => n.type === NodeType.QUESTION).map(n => n.id));

  for (const node of data.nodes) {
    if (ctx.consumed.has(node.id)) continue;

    // ── A question the thinking centres on: section heading, phrased as asked ──
    if (node.type === NodeType.QUESTION) {
      ctx.consumed.add(node.id);
      out.push(new Paragraph({ text: node.label, heading: headingFor(chapterLevel + 1) }));
      for (const p of htmlToParagraphs(sanitizeDetailHtml(node.detail))) out.push(p);
      const see = seeParagraph(node);
      if (see) out.push(see);

      // Ideas responding to this question
      const ideas = data.nodes.filter(n =>
        n.type === NodeType.IDEA &&
        !ctx.consumed.has(n.id) &&
        data.links.some(l => pairOf(l, n.id, node.id))
      );
      for (const idea of ideas) {
        ctx.consumed.add(idea.id);
        out.push(new Paragraph({ text: idea.label, heading: headingFor(chapterLevel + 2) }));
        for (const p of htmlToParagraphs(sanitizeDetailHtml(idea.detail))) out.push(p);
        const seeIdea = seeParagraph(idea);
        if (seeIdea) out.push(seeIdea);

        // Supporting considerations woven under the idea
        const pros = data.nodes.filter(n =>
          n.type === NodeType.PRO && !ctx.consumed.has(n.id) &&
          data.links.some(l => pairOf(l, n.id, idea.id))
        );
        if (pros.length) {
          out.push(new Paragraph({
            children: [new TextRun({ text: 'Supporting considerations:', italics: true })],
          }));
          for (const p of pros) {
            ctx.consumed.add(p.id);
            out.push(...argumentParagraphs(p));
          }
        }

        // Points raised against it
        const cons = data.nodes.filter(n =>
          n.type === NodeType.CON && !ctx.consumed.has(n.id) &&
          data.links.some(l => pairOf(l, n.id, idea.id))
        );
        if (cons.length) {
          out.push(new Paragraph({
            children: [new TextRun({ text: 'Points raised against it:', italics: true })],
          }));
          for (const c of cons) {
            ctx.consumed.add(c.id);
            out.push(...argumentParagraphs(c));
          }
        }

        // The decision reached on the idea
        const decisions = data.nodes.filter(n =>
          n.type === NodeType.DECISION && !ctx.consumed.has(n.id) &&
          data.links.some(l => pairOf(l, n.id, idea.id))
        );
        for (const dec of decisions) {
          ctx.consumed.add(dec.id);
          out.push(...decisionParagraphs(dec));
        }
      }
      continue;
    }

    // ── Sub-maps: lower-level chapters ──
    if (CONTAINER_TYPES.includes(node.type)) {
      ctx.consumed.add(node.id);
      const prevTitle = ctx.exportedViews.get(node.id);
      if (prevTitle) {
        out.push(new Paragraph({
          children: [
            new TextRun({ text: node.label, bold: true }),
            new TextRun({ text: ` — discussed in the section “${prevTitle}” above.` }),
          ],
        }));
        continue;
      }
      ctx.exportedViews.set(node.id, node.label);
      const subData = await loadViewData(node.id);
      for (const p of await renderChapter(node.id, node.label, chapterLevel + 1, subData, ctx)) {
        out.push(p);
      }
      continue;
    }

    // ── Operative content not hanging off a question: standalone ideas ──
    if (node.type === NodeType.IDEA) {
      // Skip ideas that answer one of this map's questions (already rendered)
      const attachedToQuestion = data.links.some(l =>
        (questionIds.has(l.fromNodeId) && l.toNodeId === node.id) ||
        (questionIds.has(l.toNodeId) && l.fromNodeId === node.id)
      );
      if (attachedToQuestion) continue;
      ctx.consumed.add(node.id);
      out.push(new Paragraph({ text: node.label, heading: headingFor(chapterLevel + 1) }));
      for (const p of htmlToParagraphs(sanitizeDetailHtml(node.detail))) out.push(p);
      const see = seeParagraph(node);
      if (see) out.push(see);
      continue;
    }

    // ── Notes & references: flowing content where they sit on the map ──
    if (node.type === NodeType.NOTE || node.type === NodeType.REFERENCE) {
      ctx.consumed.add(node.id);
      out.push(new Paragraph({ children: [new TextRun({ text: node.label, bold: true })] }));
      for (const p of htmlToParagraphs(sanitizeDetailHtml(node.detail))) out.push(p);
      const see = seeParagraph(node);
      if (see) out.push(see);
      continue;
    }

    // ── Leftover decisions render in-line, labelled in plain prose ──
    if (node.type === NodeType.DECISION) {
      ctx.consumed.add(node.id);
      out.push(...decisionParagraphs(node));
      continue;
    }

    // ── Leftover arguments keep their reasoning as bullets ──
    if (node.type === NodeType.PRO || node.type === NodeType.CON) {
      ctx.consumed.add(node.id);
      out.push(...argumentParagraphs(node));
      continue;
    }
  }
  return out;
}

// ─── document assembly ────────────────────────────────────────

export async function exportWordDocument(project: Project): Promise<void> {
  const ctx: Ctx = { consumed: new Set(), exportedViews: new Map() };

  const rootData = await loadViewData(project.rootViewId);
  // The home map reads as the report's opening chapter; "Home" would
  // look odd in a report, so the first chapter is titled "Overview".
  const rootChapter = await renderChapter(
    project.rootViewId, 'Overview', 1, rootData, ctx,
  );

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const doc = new Document({
    creator: project.author,
    title: project.name,
    description: `Report: ${project.name}`,
    features: { updateFields: true },   // Word refreshes the TOC on open
    numbering: {
      config: [{
        reference: 'report-ordered',
        levels: [0, 1, 2, 3].map(i => ({
          level: i,
          format: LevelFormat.DECIMAL,
          text: `%${i + 1}.`,
          alignment: AlignmentType.START,
          style: {
            paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } },
          },
        })),
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        // Cover
        new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({
            text: `${project.author} · ${dateStr}`,
            size: 24,
            color: '595959',
          })],
        }),

        // Table of contents
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: 'Contents', bold: true, size: 32 })],
        }),
        new TableOfContents('Contents', {
          hyperlink: true,
          headingStyleRange: '1-3',
        }),
        new Paragraph({ children: [], pageBreakBefore: true }),

        // The report itself
        ...rootChapter,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = project.name.replace(/[^a-z0-9_-]/gi, '_') || 'report';
  downloadBlob(blob, `${safeName}.docx`);
}
