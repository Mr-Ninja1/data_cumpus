import { parseMarkdownToBlocks, type InlineRun } from './markdownBlocks';

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type RenderedDiagramLookup = Record<string, { pngBase64: string; width: number; height: number } | undefined>;

function renderDiagramBlockHtml(diagramKey: string, description: string, diagrams?: RenderedDiagramLookup): string {
  const rendered = diagrams?.[diagramKey];
  const caption = description
    ? `<figcaption style="font-style:italic;font-size:10.5pt;color:#475569;margin-top:6px">${escapeHtml(description)}</figcaption>`
    : '';

  if (rendered) {
    return `<figure style="text-align:center;margin:1.25rem 0">
      <img src="data:image/png;base64,${rendered.pngBase64}" width="${rendered.width}" height="${rendered.height}" alt="${escapeHtml(description || diagramKey)}" style="max-width:100%;height:auto" />
      ${caption}
    </figure>`;
  }

  // Not rendered yet (or generation failed) — say so plainly instead of
  // silently dropping the marker or pretending a diagram exists.
  return `<div style="border:1px dashed #cbd5e1;border-radius:8px;padding:12px 16px;margin:1.25rem 0;color:#64748b;font-size:10.5pt">
    <strong>Diagram pending:</strong> ${escapeHtml(description || diagramKey)}
  </div>`;
}

function renderRuns(runs: InlineRun[]): string {
  return runs
    .map((run) => {
      let text = escapeHtml(run.text);
      if (run.bold) text = `<strong>${text}</strong>`;
      if (run.italic) text = `<em>${text}</em>`;
      return text;
    })
    .join('');
}

/**
 * Renders chapter markdown into real document structure (headings, lists,
 * emphasis) instead of leaving markdown symbols as plain text — this is the
 * fix for idea.md Section 4's rendering rule. Used by both the export route
 * and the in-app preview so a chapter looks the same in both places.
 *
 * `diagrams` is an optional lookup of already-rendered diagram images
 * (diagram_key -> PNG data), so a [DIAGRAM: key — description] marker
 * becomes a real embedded image instead of leaving the marker as plain text.
 */
export function renderMarkdownToHtml(markdown: string, diagrams?: RenderedDiagramLookup): string {
  const blocks = parseMarkdownToBlocks(markdown);
  if (!blocks.length) return '<p>Pending chapter content.</p>';

  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        const tag = `h${Math.min(Math.max(block.level, 2), 6)}`;
        return `<${tag}>${renderRuns(block.runs)}</${tag}>`;
      }
      if (block.type === 'bullet_list') {
        return `<ul>${block.items.map((item) => `<li>${renderRuns(item)}</li>`).join('')}</ul>`;
      }
      if (block.type === 'numbered_list') {
        return `<ol>${block.items.map((item) => `<li>${renderRuns(item)}</li>`).join('')}</ol>`;
      }
      if (block.type === 'diagram') {
        return renderDiagramBlockHtml(block.diagramKey, block.description, diagrams);
      }
      return `<p>${renderRuns(block.runs)}</p>`;
    })
    .join('');
}
