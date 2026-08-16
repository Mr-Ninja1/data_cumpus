// Shared markdown parsing for proposal chapter content. This is the fix for
// idea.md Section 4's rendering rule: generated content must never reach the
// exported document as raw markdown symbols in plain text. Both the HTML
// renderer (utils/markdownToHtml.ts) and the DOCX builder
// (utils/proposalDocx.ts) render from this same block model, so a chapter's
// headings/lists/emphasis are structured exactly once and rendered
// consistently everywhere.

export type InlineRun = { text: string; bold?: boolean; italic?: boolean };

export type MarkdownBlock =
  | { type: 'heading'; level: number; runs: InlineRun[] }
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'bullet_list'; items: InlineRun[][] }
  | { type: 'numbered_list'; items: InlineRun[][] }
  | { type: 'diagram'; diagramKey: string; description: string };

const ATX_HEADING = /^(#{1,6})\s+(.+)$/;
// [DIAGRAM: diagram_key — description] — same marker convention used by
// sectionSplice.ts's findDiagramInMarkdown/replaceDiagramInMarkdown, parsed
// here too so both the DOCX and HTML renderers can embed the actual
// generated image instead of leaving the marker as plain paragraph text.
const DIAGRAM_MARKER = /^\s*\[DIAGRAM:\s*([a-z0-9_]+)\s*(?:[\u2014-]\s*(.*))?\]\s*$/i;
// Requires at least one dot-separated group after the first number, so
// "1. Introduction" (a plain numbered list item) never matches, but
// "1.1 Background" / "3.3.3.1 Functional Requirements" do.
const NUMBERED_HEADING = /^\s*\*{0,2}(\d+(?:\.\d+){1,5})\*{0,2}[.)]?\s+(.+?)\*{0,2}\s*$/;
const BULLET_ITEM = /^\s*[-*•]\s+(.+)$/;
const NUMBERED_ITEM = /^\s*(\d+)\.\s+(.+)$/;

function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) runs.push({ text: text.slice(lastIndex, match.index) });
    if (match[1] !== undefined) runs.push({ text: match[1], bold: true });
    else if (match[2] !== undefined) runs.push({ text: match[2], italic: true });
    else if (match[3] !== undefined) runs.push({ text: match[3], italic: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex) });
  return runs.length ? runs : [{ text }];
}

export function parseMarkdownToBlocks(markdown: string): MarkdownBlock[] {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const blocks: MarkdownBlock[] = [];

  let paragraphBuffer: string[] = [];
  let bulletBuffer: string[] = [];
  let numberedBuffer: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', runs: parseInline(text) });
    paragraphBuffer = [];
  };
  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    blocks.push({ type: 'bullet_list', items: bulletBuffer.map((item) => parseInline(item)) });
    bulletBuffer = [];
  };
  const flushNumbered = () => {
    if (!numberedBuffer.length) return;
    blocks.push({ type: 'numbered_list', items: numberedBuffer.map((item) => parseInline(item)) });
    numberedBuffer = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushBullets();
    flushNumbered();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushAll();
      continue;
    }

    const diagramMarker = line.match(DIAGRAM_MARKER);
    if (diagramMarker) {
      flushAll();
      blocks.push({ type: 'diagram', diagramKey: diagramMarker[1].toLowerCase(), description: (diagramMarker[2] || '').trim() });
      continue;
    }

    const atx = line.match(ATX_HEADING);
    if (atx) {
      flushAll();
      const level = Math.min(atx[1].length + 1, 6);
      blocks.push({ type: 'heading', level, runs: parseInline(atx[2]) });
      continue;
    }

    const numberedHeading = line.match(NUMBERED_HEADING);
    if (numberedHeading) {
      flushAll();
      const depth = numberedHeading[1].split('.').length;
      const level = Math.min(depth, 6);
      blocks.push({ type: 'heading', level, runs: [{ text: `${numberedHeading[1]} ${numberedHeading[2].trim()}` }] });
      continue;
    }

    const bullet = line.match(BULLET_ITEM);
    if (bullet) {
      flushParagraph();
      flushNumbered();
      bulletBuffer.push(bullet[1]);
      continue;
    }

    const numbered = line.match(NUMBERED_ITEM);
    if (numbered) {
      flushParagraph();
      flushBullets();
      numberedBuffer.push(numbered[2]);
      continue;
    }

    flushBullets();
    flushNumbered();
    paragraphBuffer.push(line);
  }

  flushAll();
  return blocks;
}
