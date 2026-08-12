// Structured, chapter-keyed proposal spec.
//
// Why this exists: dumping an entire uploaded guide PDF into every generation
// call wastes tokens (a student drafting Chapter 1 doesn't need Chapter 5/6
// rules) and prevents programmatic structure checks. Instead, an admin runs a
// one-time AI extraction of the uploaded structure guide into this compact
// JSON shape, and generation pulls out only the fragment for the chapter it
// is currently drafting.

export type SpecSection = {
  number?: string;
  title: string;
  guidance?: string;
  description?: string;
  diagram_required?: boolean;
  dynamic_subsections?: boolean;
  subsection_generation_rule?: string;
  subsections?: SpecSection[];
};

export type SpecChapter = {
  key?: string; // e.g. "chapter_1"
  number?: number;
  chapter?: number;
  title: string;
  sections: SpecSection[];
  required_inputs?: string[];
  notes?: string;
};

export type SpecFrontOrBackItem = {
  key: string; // e.g. "cover_page", "table_of_contents", "references"
  guidance?: string;
};

export type StructuredProposalSpec = {
  doc_type?: string;
  citation_style?: string;
  logo_asset_note?: string;
  stages?: Record<string, { chapters?: number[]; front_matter?: string[]; back_matter?: string[]; required_diagrams?: string[] }>;
  front_matter?: SpecFrontOrBackItem[];
  chapters?: SpecChapter[];
  back_matter?: SpecFrontOrBackItem[];
  source_notes?: string | string[];
  extraction_notes?: string[];
};

function flattenSections(sections: SpecSection[] = []): SpecSection[] {
  const output: SpecSection[] = [];
  for (const section of sections) {
    output.push(section);
    if (Array.isArray(section.subsections) && section.subsections.length) {
      output.push(...flattenSections(section.subsections));
    }
  }
  return output;
}

function normalizeChapterKey(chapter: SpecChapter) {
  if (chapter.key) return chapter.key;
  const number = chapter.number ?? chapter.chapter;
  return typeof number === 'number' ? `chapter_${number}` : chapter.title?.toLowerCase().replace(/\s+/g, '_');
}

function normalizeStructuredSpec(spec: StructuredProposalSpec): StructuredProposalSpec {
  const chapters = Array.isArray(spec.chapters)
    ? spec.chapters.map((chapter) => ({
        ...chapter,
        key: normalizeChapterKey(chapter),
        number: chapter.number ?? chapter.chapter,
        sections: Array.isArray(chapter.sections) ? chapter.sections : [],
      }))
    : [];

  const hasExplicitFrontBack = Array.isArray(spec.front_matter) || Array.isArray(spec.back_matter);
  const initialStage = spec.stages?.initial_proposal;

  return {
    ...spec,
    chapters,
    front_matter: hasExplicitFrontBack
      ? spec.front_matter
      : (initialStage?.front_matter || []).map((key) => ({ key, guidance: `Include ${key.replace(/_/g, ' ')} as required by the school proposal structure.` })),
    back_matter: hasExplicitFrontBack
      ? spec.back_matter
      : (initialStage?.back_matter || []).map((key) => ({ key, guidance: `Include ${key.replace(/_/g, ' ')} as required by the school proposal structure.` })),
  };
}

export function parseStructuredSpec(value: unknown): StructuredProposalSpec | null {
  if (!value) return null;
  if (typeof value === 'object') return normalizeStructuredSpec(value as StructuredProposalSpec);
  if (typeof value === 'string') {
    try {
      return normalizeStructuredSpec(JSON.parse(value) as StructuredProposalSpec);
    } catch {
      return null;
    }
  }
  return null;
}

/** Returns only the guidance relevant to one chapter, not the whole document. */
export function getChapterSpecFragment(spec: StructuredProposalSpec | null, chapterKey: string): string {
  if (!spec?.chapters?.length) return '';
  const chapter = spec.chapters.find((c) => c.key === chapterKey || normalizeChapterKey(c) === chapterKey);
  if (!chapter) return '';

  const lines = [`Required structure for ${chapter.title || chapterKey} (from the official structure guide):`];
  if (chapter.notes) lines.push(`Notes: ${chapter.notes}`);
  if (Array.isArray(chapter.required_inputs) && chapter.required_inputs.length) {
    lines.push(`Required inputs before/while drafting: ${chapter.required_inputs.join(', ')}`);
  }
  for (const section of flattenSections(chapter.sections || [])) {
    const numberPart = section.number ? `${section.number} ` : '';
    const diagramPart = section.diagram_required || section.title.toLowerCase().includes('conceptual framework') ? ' (diagram required here)' : '';
    const guidanceText = section.guidance || section.description || '';
    const guidancePart = guidanceText ? `: ${guidanceText}` : '';
    const dynamicPart = section.dynamic_subsections && section.subsection_generation_rule ? ` Dynamic subsection rule: ${section.subsection_generation_rule}` : '';
    lines.push(`- ${numberPart}${section.title}${guidancePart}${diagramPart}${dynamicPart}`);
  }
  return lines.join('\n');
}

export function getFrontOrBackMatterFragment(
  spec: StructuredProposalSpec | null,
  key: string
): string {
  if (!spec) return '';
  const item =
    spec.front_matter?.find((entry) => entry.key === key) || spec.back_matter?.find((entry) => entry.key === key);
  if (!item?.guidance) return '';
  return `Required structure for ${key.replace(/_/g, ' ')} (from the official structure guide): ${item.guidance}`;
}

/**
 * Fallback for specs that have not been converted to structured JSON yet.
 * Extracts only the markdown block whose heading matches the chapter, instead
 * of injecting the whole spec_md into the prompt.
 */
export function extractMarkdownSectionForChapter(specText: string, chapterKey: string): string {
  const normalizedKey = (chapterKey || '').replace(/_/g, ' ').toLowerCase();
  const lines = (specText || '').split(/\r?\n/);
  const collected: string[] = [];
  let capturing = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      const heading = headingMatch[1].trim().toLowerCase();
      capturing = heading.includes(normalizedKey) || heading.includes((chapterKey || '').toLowerCase());
      if (capturing) collected.push(rawLine);
      continue;
    }
    if (capturing) collected.push(rawLine);
  }

  return collected.join('\n').trim();
}


