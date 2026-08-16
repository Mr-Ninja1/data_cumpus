import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { loadWorkspaceSchoolSettings } from '@/utils/workspaceSchoolSettings';
import { extractHeadingsFromMarkdown } from '@/utils/proposalFlow';
import { renderMarkdownToHtml, type RenderedDiagramLookup } from '@/utils/markdownToHtml';
import { buildProposalDocx, type DocxLogo, type RenderedDiagramLookup as DocxDiagramLookup } from '@/utils/proposalDocx';
import { formatIeeeReference } from '@/utils/ieeeReferences';
import { getImageDimensions, fitWithinBox } from '@/utils/imageDimensions';

export const runtime = 'nodejs';

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(value: string) {
  return escapeHtml(String(value || '')).replace(/\n/g, '<br />');
}

function formatContentHtml(content: string, diagrams?: RenderedDiagramLookup) {
  return renderMarkdownToHtml(content, diagrams);
}

function toIeeeReference(ref: any, index: number) {
  return formatIeeeReference(ref, index, { quoteStyle: 'curly' });
}

const CHAPTER_ORDER = ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5', 'chapter_6'];
const CHAPTER_NUMBER_WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];

function chapterTocLabel(key: string, title: string): string {
  const match = key.match(/chapter_(\d+)/);
  if (!match) return (title || key).toUpperCase();
  const idx = parseInt(match[1], 10) - 1;
  const word = CHAPTER_NUMBER_WORDS[idx] ?? match[1];
  
  // If title is generic "Chapter X" or empty, don't duplicate — just use the chapter number.
  // Otherwise, append the actual chapter title (e.g., "Introduction", "Literature Review").
  const isGenericTitle = !title || title.toLowerCase() === `chapter ${match[1]}`;
  const suffix = isGenericTitle ? '' : `: ${title.toUpperCase()}`;
  return `CHAPTER ${word}${suffix}`;
}

/** Returns depth for indenting: 1 for "1.1", 2 for "1.1.1", 3 for "1.1.1.1" */
function headingSubDepth(number?: string): number {
  if (!number) return 1;
  return (number.match(/\./g) ?? []).length;
}

/**
 * Builds the table of contents from the chapters that actually exist and
 * whatever headings were actually drafted in them, instead of a rigid
 * pre-written list — so it stays correct as content changes.
 */
function buildTocEntries(chapters: any[]): Array<{ key: string; title: string; headings: Array<{ number?: string; text: string }>; incomplete: boolean }> {
  const byKey = new Map((chapters || []).map((chapter: any) => [chapter.chapter_key, chapter]));
  const entries: Array<{ key: string; title: string; headings: Array<{ number?: string; text: string }>; incomplete: boolean }> = [];
  for (const key of CHAPTER_ORDER) {
    const chapter = byKey.get(key);
    if (!chapter) continue;
    entries.push({
      key,
      title: chapter.title || key,
      headings: extractHeadingsFromMarkdown(chapter.content_md || ''),
      // Never let a chapter the model didn't actually finish look done on
      // the Table of Contents — flag it plainly instead of silently listing
      // only whatever headings happened to make it into the cut-off draft.
      incomplete: Boolean(chapter.incomplete),
    });
  }
  return entries;
}

function buildProposalMarkdown(project: any, chapters: any[], references: any[]) {
  const chapterEntries = Array.isArray(chapters) && chapters.length
    ? chapters
    : [];

  const tocEntries = buildTocEntries(chapterEntries);
  const tocLines: string[] = [];
  tocEntries.forEach((entry) => {
    tocLines.push(`${chapterTocLabel(entry.key, entry.title)}${entry.incomplete ? ' [INCOMPLETE — missing section(s)]' : ''}`);
    entry.headings
      .filter((heading) => !shouldSkipHeading(heading, entry.key))
      .forEach((heading) => {
        const depth = headingSubDepth(heading.number);
        const indent = '  '.repeat(depth);
        tocLines.push(`${indent}${heading.number ? `${heading.number} ` : ''}${heading.text}`);
      });
    tocLines.push('');
  });
  tocLines.push('REFERENCES');

  const lines = [
    `# ${project?.title || 'Proposal'}`,
    '',
    `Department: ${project?.department || 'Not set'}`,
    `Supervisor: ${project?.supervisor || 'Not set'}`,
    `Academic year: ${project?.academic_year || 'Not set'}`,
    '',
    '## Cover page',
    '',
    chapterEntries.find((chapter: any) => chapter.chapter_key === 'cover_page')?.content_md || 'Pending cover page content.',
    '',
    '## Table of contents',
    '',
    ...tocLines,
    '',
  ];

  if (chapterEntries.length) {
    chapterEntries
      .filter((chapter: any) => chapter.chapter_key !== 'cover_page')
      .forEach((chapter: any) => {
        lines.push(`## ${chapter.title || chapter.chapter_key || 'Chapter'}`);
        lines.push('');
        lines.push(chapter.content_md || chapter.content || 'Pending chapter content.');
        lines.push('');
      });
  } else {
    lines.push('## Chapters');
    lines.push('');
    lines.push('No chapter content has been generated yet.');
    lines.push('');
  }

  if (references.length) {
    lines.push('## References');
    lines.push('');
    references.forEach((ref: any, index: number) => {
      lines.push(toIeeeReference(ref, index));
    });
    lines.push('');
  }

  return lines.join('\n');
}

async function getLogoUrl(path: string | null | undefined) {
  if (!supabaseServer || !path) return null;
  const signed = await supabaseServer.storage.from('proposal_templates').createSignedUrl(path, 3600);
  return signed.data?.signedUrl || null;
}

const DOCX_IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp']);

/** Downloads the school logo and sizes it for embedding directly into the
 * .docx cover page (docx.js needs raw bytes + explicit pixel dimensions —
 * it can't just take a URL like the HTML export can). Best-effort: any
 * failure just means the DOCX cover page renders without a logo instead of
 * failing the whole export. */
async function getLogoForDocx(path: string | null | undefined): Promise<DocxLogo | null> {
  if (!supabaseServer || !path) return null;
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const type = ext === 'jpeg' ? 'jpg' : ext;
  if (!DOCX_IMAGE_TYPES.has(ext)) return null;

  try {
    const { data, error } = await supabaseServer.storage.from('proposal_templates').download(path);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    const dimensions = getImageDimensions(buffer);
    const { width, height } = dimensions ? fitWithinBox(dimensions, 180, 120) : { width: 140, height: 90 };
    return { data: buffer, type: type as DocxLogo['type'], width, height };
  } catch {
    return null;
  }
}

function shouldSkipHeading(heading: { number?: string; text: string }, chapterKey: string): boolean {
  const match = chapterKey.match(/chapter_(\d+)/);
  if (!match) return false;
  const num = match[1];
  const text = heading.text.toLowerCase();
  // Skip if it looks like a duplicate chapter label: "Chapter X", "Chapter X: Something", etc.
  return text.startsWith(`chapter ${num}`) || text === 'chapter' || (text === 'introduction' && num === '1');
}

function buildTocHtml(chapters: any[]) {
  const tocEntries = buildTocEntries(chapters);

  const chapterRows = tocEntries.map((entry) => {
    const label = chapterTocLabel(entry.key, entry.title);

    const headingRows = entry.headings
      .filter((heading) => !shouldSkipHeading(heading, entry.key))
      .map((heading) => {
        const depth = headingSubDepth(heading.number);
        const indent = depth === 1 ? '1.5rem' : depth === 2 ? '3rem' : '4.5rem';
        const color = depth === 1 ? '#1d4ed8' : '#374151';
        const decoration = depth === 1 ? 'underline' : 'none';
        const text = `${heading.number ? `${heading.number} ` : ''}${heading.text}`;
        return `<div style="margin-left:${indent};color:${color};text-decoration:${decoration};padding:1px 0;font-size:11pt">${escapeHtml(text)}</div>`;
      }).join('');

    const incompleteBadge = entry.incomplete
      ? ' <span style="color:#b45309;background:#fef3c7;border-radius:9999px;padding:1px 8px;font-size:9pt;text-transform:uppercase;letter-spacing:0.02em">Incomplete</span>'
      : '';

    return `
      <div style="margin-bottom:8px">
        <div style="font-weight:bold;color:#1d4ed8;text-decoration:underline;text-transform:uppercase;font-size:11pt;padding:2px 0">${escapeHtml(label)}${incompleteBadge}</div>
        ${headingRows}
      </div>`;
  }).join('');

  return `
    <div style="font-family:'Times New Roman',Times,serif;font-size:12pt">
      ${chapterRows}
      <div style="font-weight:bold;color:#1d4ed8;text-decoration:underline;text-transform:uppercase;font-size:11pt;padding:2px 0;margin-top:8px">REFERENCES</div>
    </div>`;
}

function buildCoverPageHtml({
  project,
  coverText,
  logoUrl,
  schoolName,
  program,
  studentName,
  studentId,
  supervisor,
  year,
}: {
  project: any;
  coverText: string;
  logoUrl: string | null;
  schoolName: string;
  program: string;
  studentName: string;
  studentId: string;
  supervisor: string;
  year: string;
}) {
  return `
    <section class="cover-page">
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="School logo" class="cover-logo" />` : ''}
      <div class="cover-school">${escapeHtml(schoolName)}</div>
      <div class="cover-program">${escapeHtml(program)}</div>
      <div class="cover-title">${escapeHtml(project?.title || 'Proposal')}</div>
      <div class="cover-by">By</div>
      <div class="cover-student">${escapeHtml(studentName || 'Student name not available')}</div>
      ${studentId ? `<div class="cover-student-id">Student Number: ${escapeHtml(studentId)}</div>` : ''}
      ${supervisor ? `<div class="cover-supervisor"><strong>Supervisor:</strong><br />${escapeHtml(supervisor)}</div>` : ''}
      <div class="cover-location">NDOLA, ZAMBIA</div>
      <div class="cover-year">${escapeHtml(year || new Date().getFullYear().toString())}</div>
      ${coverText ? `<div class="cover-fallback-text">${nl2br(coverText)}</div>` : ''}
    </section>
  `;
}

function buildProposalHtml(project: any, chapters: any[], references: any[], coverPageHtml: string, diagrams?: RenderedDiagramLookup) {
  const chapterEntries = Array.isArray(chapters) && chapters.length ? chapters : [];
  const coverPage = chapterEntries.find((chapter: any) => chapter.chapter_key === 'cover_page');
  const chapterHtml = chapterEntries.length
    ? chapterEntries
        .filter((chapter: any) => chapter.chapter_key !== 'cover_page')
        .map((chapter: any) => `
      <section>
        <h2>${escapeHtml(chapter.title || chapter.chapter_key || 'Chapter')}</h2>
        ${formatContentHtml(chapter.content_md || chapter.content || 'Pending chapter content.', diagrams)}
      </section>`).join('')
    : '<section><h2>Chapters</h2><p>No chapter content has been generated yet.</p></section>';

  const referencesHtml = references.length
    ? `<section><h2>References</h2><div>${references.map((ref: any, index: number) => `<p>${escapeHtml(toIeeeReference(ref, index))}</p>`).join('')}</div></section>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project?.title || 'Proposal')}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: "Times New Roman", Times, serif;
        color: #0f172a;
        line-height: 1.6;
        max-width: 900px;
        margin: 2rem auto;
        padding: 0 1.25rem;
        font-size: 12pt;
      }
      h1, h2, h3, h4, h5, h6 { font-family: "Times New Roman", Times, serif; color: #0f172a; font-weight: 700; line-height: 1.3; }
      h1 { font-size: 20pt; margin: 0 0 1.25rem; }
      h2 { font-size: 16pt; margin: 2rem 0 1rem; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.35rem; }
      h3 { font-size: 14pt; margin: 1.5rem 0 0.75rem; }
      h4 { font-size: 13pt; margin: 1.25rem 0 0.6rem; }
      h5, h6 { font-size: 12pt; margin: 1rem 0 0.5rem; font-style: italic; }
      p { margin: 0 0 0.9rem; text-align: justify; }
      .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; font-size: 11pt; }
      ul, ol { padding-left: 1.5rem; margin: 0 0 0.9rem; }
      li { margin-bottom: 0.35rem; }
      section { margin-bottom: 1.5rem; }
      section > section, section + section { page-break-before: always; }
      .cover-page { min-height: 88vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding: 2rem 1rem 3rem; page-break-after: always; }
      .cover-logo { max-width: 180px; max-height: 120px; object-fit: contain; margin-bottom: 1rem; }
      .cover-school { font-size: 2rem; font-weight: 700; text-transform: uppercase; margin-top: 0.75rem; }
      .cover-program { font-size: 1.2rem; font-style: italic; margin-top: 0.35rem; }
      .cover-title { font-size: 1.8rem; font-weight: 700; margin: 4rem 0 2rem; max-width: 760px; }
      .cover-by { font-size: 1.25rem; font-style: italic; margin-top: 1rem; }
      .cover-student { font-size: 1.35rem; font-weight: 700; margin-top: 1rem; text-transform: uppercase; }
      .cover-student-id { font-size: 1.15rem; margin-top: 0.25rem; }
      .cover-supervisor { font-size: 1.15rem; margin-top: 3rem; }
      .cover-location { font-size: 1.2rem; font-weight: 700; margin-top: 4rem; }
      .cover-year { font-size: 1.15rem; margin-top: 0.25rem; }
      .cover-fallback-text { display: none; }
      @media print {
        body { margin: 0; padding: 0 0.5in; }
        .cover-page { min-height: 100vh; }
      }
    </style>
  </head>
  <body>
    ${coverPageHtml}
    <div class="meta">
      <p><strong>Department:</strong> ${escapeHtml(project?.department || 'Not set')}</p>
      <p><strong>Supervisor:</strong> ${escapeHtml(project?.supervisor || 'Not set')}</p>
      <p><strong>Academic year:</strong> ${escapeHtml(project?.academic_year || 'Not set')}</p>
    </div>
    <section>
      <h2>Table of contents</h2>
      ${buildTocHtml(chapters)}
    </section>
    ${chapterHtml}
    ${referencesHtml}
  </body>
</html>`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const metadata = (project.metadata || {}) as Record<string, any>;
  const chapters = Array.isArray(metadata.chapters) ? metadata.chapters : [];
  const references = Array.isArray(metadata.references) ? metadata.references : [];

  // A chapter the model failed to fully finish (common with token-limited
  // free-tier models cutting a response short) should never be silently
  // exported as if it were done — the user must knowingly choose to export
  // it as-is via `force`, instead of it slipping through unnoticed.
  const incompleteChapters = chapters.filter(
    (chapter: any) => chapter.incomplete && String(chapter.content_md || '').trim().length > 0
  );
  if (incompleteChapters.length && !force) {
    return NextResponse.json(
      {
        requiresConfirmation: true,
        error: 'incomplete_chapters',
        message: `${incompleteChapters.length === 1 ? 'This chapter is' : 'These chapters are'} still missing required section(s): ${incompleteChapters
          .map((chapter: any) => `${chapter.title || chapter.chapter_key}${Array.isArray(chapter.missing_sections) && chapter.missing_sections.length ? ` (missing ${chapter.missing_sections.join(', ')})` : ''}`)
          .join('; ')}. Ask the AI to fill those in first, or export anyway knowing it's incomplete.`,
        incompleteChapters: incompleteChapters.map((chapter: any) => ({
          chapter_key: chapter.chapter_key,
          title: chapter.title,
          missing_sections: chapter.missing_sections || [],
        })),
      },
      { status: 409 }
    );
  }

  const schoolSettings = await loadWorkspaceSchoolSettings();
  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('full_name,student_id,program,department')
    .eq('id', user.id)
    .maybeSingle();
  const [logoUrl, docxLogo] = await Promise.all([
    getLogoUrl(schoolSettings.logo_path),
    getLogoForDocx(schoolSettings.logo_path),
  ]);
  const coverPage = chapters.find((chapter: any) => chapter.chapter_key === 'cover_page');
  const coverPageHtml = buildCoverPageHtml({
    project,
    coverText: String(coverPage?.content_md || coverPage?.content || ''),
    logoUrl,
    schoolName: schoolSettings.school_name,
    program: String(project.department || profile?.department || profile?.program || schoolSettings.default_program || 'School of Information and Communication Technology'),
    studentName: String(profile?.full_name || '').trim(),
    studentId: String(profile?.student_id || '').trim(),
    supervisor: String(project.supervisor || '').trim(),
    year: String(project.academic_year || new Date().getFullYear()),
  });
  // Diagrams generated during drafting/editing are stored as base64 PNGs in
  // metadata.diagrams — build lookup maps in the shape each renderer needs
  // so a [DIAGRAM: key] marker becomes an actual embedded image everywhere.
  const diagramsMeta = (metadata.diagrams || {}) as Record<string, { pngBase64?: string; width?: number; height?: number }>;
  const htmlDiagrams: RenderedDiagramLookup = {};
  const docxDiagrams: DocxDiagramLookup = {};
  for (const [key, value] of Object.entries(diagramsMeta)) {
    if (!value?.pngBase64) continue;
    const width = value.width || 500;
    const height = value.height || 300;
    htmlDiagrams[key] = { pngBase64: value.pngBase64, width, height };
    docxDiagrams[key] = { data: Buffer.from(value.pngBase64, 'base64'), width, height };
  }

  const markdown = buildProposalMarkdown(project, chapters, references);
  const html = buildProposalHtml(project, chapters, references, coverPageHtml, htmlDiagrams);

  const studentName = String(profile?.full_name || '').trim();
  const studentId = String(profile?.student_id || '').trim();
  const program = String(
    project.department || profile?.department || profile?.program || schoolSettings.default_program || 'School of Information and Communication Technology'
  );

  let docxBase64: string | null = null;
  try {
    const docxBuffer = await buildProposalDocx({
      project,
      chapters,
      references,
      schoolName: schoolSettings.school_name,
      program,
      studentName,
      studentId,
      logo: docxLogo,
      diagrams: docxDiagrams,
    });
    docxBase64 = docxBuffer.toString('base64');
  } catch (docxErr) {
    // A ready-to-print .docx is a nice-to-have on top of the HTML export —
    // don't fail the whole export if Word generation has an issue.
    console.error('DOCX export failed', docxErr);
  }

  const { data: exportRow, error: exportError } = await supabaseServer
    .from('proposal_exports')
    .insert({
      project_id: id,
      format: docxBase64 ? 'docx' : 'html',
      file_path: `/exports/${id}.${docxBase64 ? 'docx' : 'html'}`,
      status: 'complete',
      metadata: { markdown, html, stage: metadata.stage || 'initial_proposal', chapter_count: chapters.length, reference_count: references.length },
    })
    .select()
    .single();

  if (exportError) {
    return NextResponse.json({ error: exportError.message }, { status: 500 });
  }

  return NextResponse.json({ export: exportRow, markdown, html, docxBase64 });
}
