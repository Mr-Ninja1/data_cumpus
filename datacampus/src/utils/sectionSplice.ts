// Locates and replaces a single numbered section (e.g. "1.2") inside a
// chapter's markdown blob, without touching the rest of the chapter. This is
// what lets `regenerate_chapter_section` be a genuinely scoped edit tool
// instead of a full chapter rewrite.

export type SectionMatch = {
  startLine: number;
  endLine: number;
  headingLine: string;
  body: string;
};

function buildSectionHeadingRegex(sectionNumber: string) {
  const escaped = sectionNumber.replace(/\./g, '\\.');
  // Matches "1.2 Title", "**1.2 Title**", "### 1.2 Title", etc.
  return new RegExp(`^\\s*(?:#{1,6}\\s*)?\\*{0,2}${escaped}(?:[.)]|\\s)\\s*\\S`, 'i');
}

const ANY_NUMBERED_HEADING = /^\s*(?:#{1,6}\s*)?\*{0,2}(\d+(?:\.\d+)*)\b/;

/** Finds the line range for a numbered section within a chapter's markdown. */
export function findSectionInMarkdown(contentMd: string, sectionNumber: string): SectionMatch | null {
  const text = String(contentMd || '');
  const lines = text.split(/\r?\n/);
  const headingRegex = buildSectionHeadingRegex(sectionNumber);
  const depth = sectionNumber.split('.').length;

  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i])) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) return null;

  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    const match = lines[i].match(ANY_NUMBERED_HEADING);
    if (match) {
      const otherDepth = match[1].split('.').length;
      if (otherDepth <= depth) {
        endLine = i;
        break;
      }
    }
  }

  return {
    startLine,
    endLine,
    headingLine: lines[startLine],
    body: lines.slice(startLine, endLine).join('\n').trim(),
  };
}

/** Replaces just the matched section's lines with new text, leaving the rest of the chapter untouched. */
export function replaceSectionInMarkdown(contentMd: string, sectionNumber: string, replacementText: string): string | null {
  const text = String(contentMd || '');
  const lines = text.split(/\r?\n/);
  const match = findSectionInMarkdown(text, sectionNumber);
  if (!match) return null;

  const before = lines.slice(0, match.startLine);
  const after = lines.slice(match.endLine);
  const replacementLines = String(replacementText || '').trim().split(/\r?\n/);
  return [...before, ...replacementLines, ...after].join('\n').trim();
}

// Diagrams are represented inline as a single-line marker:
// [DIAGRAM: diagram_key — description text]
// This keeps regenerate_diagram scoped to one line, same principle as
// section splicing above, without requiring a separate diagrams table.
function buildDiagramMarkerRegex(diagramKey: string) {
  const escaped = diagramKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*\\[DIAGRAM:\\s*${escaped}\\s*(?:[—-]\\s*(.*))?\\]\\s*$`, 'i');
}

export function findDiagramInMarkdown(contentMd: string, diagramKey: string): { lineIndex: number; description: string } | null {
  const lines = String(contentMd || '').split(/\r?\n/);
  const regex = buildDiagramMarkerRegex(diagramKey);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(regex);
    if (match) return { lineIndex: i, description: match[1] || '' };
  }
  return null;
}

const ANY_DIAGRAM_MARKER = /^\s*\[DIAGRAM:\s*([a-z0-9_]+)\s*(?:[\u2014-]\s*(.*))?\]\s*$/i;

/** Scans a chapter's full markdown for every [DIAGRAM: key — description]
 * marker it contains, regardless of key — used right after generation to
 * find which diagrams this chapter now needs actually rendered. */
export function findDiagramMarkersInMarkdown(contentMd: string): Array<{ diagramKey: string; description: string }> {
  const lines = String(contentMd || '').split(/\r?\n/);
  const found: Array<{ diagramKey: string; description: string }> = [];
  for (const line of lines) {
    const match = line.match(ANY_DIAGRAM_MARKER);
    if (match) found.push({ diagramKey: match[1].toLowerCase(), description: (match[2] || '').trim() });
  }
  return found;
}

/** Replaces one [DIAGRAM: key — description] marker's description, leaving everything else untouched. Returns null if the marker doesn't exist yet. */
export function replaceDiagramInMarkdown(contentMd: string, diagramKey: string, newDescription: string): string | null {
  const text = String(contentMd || '');
  const lines = text.split(/\r?\n/);
  const found = findDiagramInMarkdown(text, diagramKey);
  if (!found) return null;
  lines[found.lineIndex] = `[DIAGRAM: ${diagramKey} — ${newDescription.trim()}]`;
  return lines.join('\n').trim();
}

/** Inserts a brand-new [DIAGRAM: key — description] marker at the end of the content when the key doesn't exist yet. */
export function insertDiagramInMarkdown(contentMd: string, diagramKey: string, description: string): string {
  const text = String(contentMd || '').trim();
  const marker = `[DIAGRAM: ${diagramKey} — ${description.trim()}]`;
  return text ? `${text}\n\n${marker}` : marker;
}
