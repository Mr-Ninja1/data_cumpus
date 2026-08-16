// The scoped tool layer for the conversation/flexibility mode described in
// idea.md Section 3. Each tool touches only what it needs to — never the
// whole document — so edit requests can never silently fall back to full
// chapter/document regeneration.

import { replaceSectionInMarkdown } from './sectionSplice';

export type ChapterEntry = {
  chapter_key?: string;
  title?: string;
  content_md?: string;
  stage?: string;
  updated_at?: string;
};

export const ALLOWED_METADATA_FIELDS = new Set([
  'title',
  'department',
  'supervisor',
  'academic_year',
  'brand_color',
  'student_name',
  'student_id',
  'program',
  'course',
  'proposal_context', // Working memory for generation decisions and user preferences
]);


// Fields that map to real project columns instead of metadata keys
export const PROJECT_COLUMN_FIELDS = new Set(['title', 'department', 'supervisor', 'academic_year']);

export function updateMetadataField(
  metadata: Record<string, unknown>,
  field: string,
  value: string
): { ok: true; metadata: Record<string, unknown> } | { ok: false; error: string } {
  if (!ALLOWED_METADATA_FIELDS.has(field)) {
    return { ok: false, error: `Unsupported metadata field: "${field}". Allowed fields: ${Array.from(ALLOWED_METADATA_FIELDS).join(', ')}.` };
  }
  // Parse JSON strings for complex fields like proposal_context
  let finalValue: unknown = value;
  if (field === 'proposal_context' && typeof value === 'string') {
    try {
      finalValue = JSON.parse(value);
    } catch {
      // Keep as string if not valid JSON
    }
  }
  return { ok: true, metadata: { ...metadata, [field]: finalValue } };
}

// Mirrors base_spec.json's stage front_matter arrays — the minimum required
// structure that update_front_matter_order must never silently drop.
const STAGE_REQUIRED_FRONT_MATTER: Record<string, string[]> = {
  initial_proposal: ['cover_page', 'table_of_contents'],
  full_project: ['cover_page', 'abstract', 'acknowledgement', 'table_of_contents'],
};

export function getRequiredFrontMatter(stage: string): string[] {
  return STAGE_REQUIRED_FRONT_MATTER[stage] || STAGE_REQUIRED_FRONT_MATTER.initial_proposal;
}

export type FrontMatterUpdateResult =
  | { ok: true; order: string[] }
  | { ok: false; requiresConfirmation: true; missing: string[]; message: string };

export function updateFrontMatterOrder(newOrder: string[], stage: string): FrontMatterUpdateResult {
  const required = getRequiredFrontMatter(stage);
  const missing = required.filter((key) => !newOrder.includes(key));
  if (missing.length) {
    return {
      ok: false,
      requiresConfirmation: true,
      missing,
      message: `This would remove required front matter section(s): ${missing.join(', ')}. These are required by the school proposal structure. Reply to confirm you really want to remove them, or send an order that keeps them.`,
    };
  }
  return { ok: true, order: newOrder };
}

/** Applies a scoped edit to one chapter's markdown — either just one numbered section, or the whole chapter if no section number is given. */
export function regenerateSection(contentMd: string, sectionNumber: string | undefined, replacementText: string): string {
  if (!sectionNumber) {
    return replacementText.trim();
  }
  const spliced = replaceSectionInMarkdown(contentMd, sectionNumber, replacementText);
  if (spliced !== null) return spliced;
  // Section number not found in the existing content — append rather than
  // silently discarding the requested addition.
  return `${String(contentMd || '').trim()}\n\n${replacementText.trim()}`.trim();
}

const FRONT_MATTER_PAGE_TITLES: Record<string, string> = {
  abstract: 'Abstract',
  acknowledgement: 'Acknowledgement',
  dedication: 'Dedication',
  table_of_contents: 'Table of Contents',
};

export function frontMatterPageTitle(pageType: string): string {
  return FRONT_MATTER_PAGE_TITLES[pageType] || pageType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Inserts pageType into the front-matter order (if missing) and returns the updated order — never drops existing entries. */
export function insertFrontMatterPage(currentOrder: string[], pageType: string): string[] {
  if (currentOrder.includes(pageType)) return currentOrder;
  // Cover page always stays first; new front-matter pages are inserted right
  // after it, before table_of_contents (which should stay last among front matter).
  const coverIndex = currentOrder.indexOf('cover_page');
  const tocIndex = currentOrder.indexOf('table_of_contents');
  const insertAt = tocIndex !== -1 ? tocIndex : coverIndex !== -1 ? coverIndex + 1 : currentOrder.length;
  const next = [...currentOrder];
  next.splice(insertAt, 0, pageType);
  return next;
}

export function buildFrontMatterContentPrompt({
  pageType,
  projectTitle,
  instruction,
}: {
  pageType: string;
  projectTitle: string;
  instruction: string;
}): string {
  const title = frontMatterPageTitle(pageType);
  return [
    `Write the "${title}" page for an academic project proposal titled "${projectTitle}".`,
    'Return ONLY the page content in markdown — no surrounding commentary, no code fences, no repeating the page title as a heading (the document template already adds it).',
    instruction ? `Specific guidance from the author: ${instruction}` : 'No specific guidance given — write a suitable, professional default for this page type.',
  ].join('\n');
}

export type SectionEditReference = { title?: string; author?: string; year?: string | number | null };

export function buildSectionEditPrompt({
  chapterTitle,
  sectionNumber,
  currentText,
  instruction,
  references,
}: {
  chapterTitle: string;
  sectionNumber?: string;
  currentText: string;
  instruction: string;
  references?: SectionEditReference[];
}): string {
  const scope = sectionNumber ? `section ${sectionNumber}` : `the "${chapterTitle}" content`;
  // Numbered by array position — must match the References page's numbering
  // (see proposalDocx.ts / export route), so a [3] added here points at the
  // same source [3] on that page.
  const referencesBlock = references && references.length
    ? [
        'Citation style is IEEE. If you add or keep any citation, cite ONLY using the bracket numbers below, exactly as numbered — never "Author (Year)" prose, and never a number not in this list:',
        ...references.map((ref, i) => `[${i + 1}] ${ref.author || 'Unknown'} — "${ref.title || 'Reference'}" (${ref.year || 'n.d.'})`),
      ].join('\n')
    : '';
  return [
    `You are editing ${scope} of an academic proposal. Apply exactly the requested change and preserve the original heading/number formatting.`,
    'Return ONLY the revised text for this scope — no extra commentary, no surrounding chapter content, no markdown code fences.',
    referencesBlock,
    '',
    'Current text:',
    '"""',
    currentText || '(empty — write it from scratch using the instruction below)',
    '"""',
    '',
    `Requested change: ${instruction}`,
  ].join('\n');
}
