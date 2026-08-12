import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { loadWorkspaceSchoolSettings } from '@/utils/workspaceSchoolSettings';
import { extractHeadingsFromMarkdown } from '@/utils/proposalFlow';

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

function formatContentHtml(content: string) {
  const normalized = String(content || '').replace(/\r/g, '');
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  if (!paragraphs.length) {
    return '<p>Pending chapter content.</p>';
  }

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph.replace(/\n/g, ' '))}</p>`).join('');
}

function toIeeeReference(ref: any, index: number) {
  const author = String(ref?.author || 'Unknown').trim();
  const title = String(ref?.title || ref?.citation_key || 'Reference').trim();
  const journal = String(ref?.journal || ref?.publisher || '').trim();
  const year = String(ref?.year || 'n.d.').trim();
  const url = String(ref?.url || '').trim();
  const doi = String(ref?.doi || '').trim();
  const tail = doi ? `doi: ${doi}` : url ? `Available: ${url}` : '';
  const container = journal ? `, ${journal}` : '';
  const suffix = tail ? `, ${tail}` : '';
  return `[${index + 1}] ${author}, “${title}”${container}, ${year}${suffix}.`;
}

const CHAPTER_ORDER = ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5', 'chapter_6'];

/**
 * Builds the table of contents from the chapters that actually exist and
 * whatever headings were actually drafted in them, instead of a rigid
 * pre-written list — so it stays correct as content changes.
 */
function buildTocEntries(chapters: any[]) {
  const byKey = new Map((chapters || []).map((chapter: any) => [chapter.chapter_key, chapter]));
  const entries: Array<{ title: string; headings: Array<{ number?: string; text: string }> }> = [];
  for (const key of CHAPTER_ORDER) {
    const chapter = byKey.get(key);
    if (!chapter) continue;
    entries.push({
      title: chapter.title || key,
      headings: extractHeadingsFromMarkdown(chapter.content_md || ''),
    });
  }
  return entries;
}

function buildProposalMarkdown(project: any, chapters: any[], references: any[]) {
  const chapterEntries = Array.isArray(chapters) && chapters.length
    ? chapters
    : [];

  const tocEntries = buildTocEntries(chapterEntries);
  const tocLines = ['1. Cover page'];
  let tocIndex = 2;
  tocEntries.forEach((entry) => {
    tocLines.push(`${tocIndex}. ${entry.title}`);
    entry.headings.forEach((heading) => {
      tocLines.push(`   - ${heading.number ? `${heading.number} ` : ''}${heading.text}`);
    });
    tocIndex += 1;
  });
  tocLines.push(`${tocIndex}. References`);

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

function buildTocHtml(chapters: any[]) {
  const tocEntries = buildTocEntries(chapters);
  const itemsHtml = tocEntries
    .map((entry) => {
      const subItems = entry.headings.length
        ? `<ol>${entry.headings.map((heading) => `<li>${escapeHtml(`${heading.number ? `${heading.number} ` : ''}${heading.text}`)}</li>`).join('')}</ol>`
        : '';
      return `<li>${escapeHtml(entry.title)}${subItems}</li>`;
    })
    .join('');
  return `<ol><li>Cover page</li>${itemsHtml}<li>References</li></ol>`;
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

function buildProposalHtml(project: any, chapters: any[], references: any[], coverPageHtml: string) {
  const chapterEntries = Array.isArray(chapters) && chapters.length ? chapters : [];
  const coverPage = chapterEntries.find((chapter: any) => chapter.chapter_key === 'cover_page');
  const chapterHtml = chapterEntries.length
    ? chapterEntries
        .filter((chapter: any) => chapter.chapter_key !== 'cover_page')
        .map((chapter: any) => `
      <section>
        <h2>${escapeHtml(chapter.title || chapter.chapter_key || 'Chapter')}</h2>
        ${formatContentHtml(chapter.content_md || chapter.content || 'Pending chapter content.')}
      </section>`).join('')
    : '<section><h2>Chapters</h2><p>No chapter content has been generated yet.</p></section>';

  const referencesHtml = references.length
    ? `<section><h2>References</h2><ol>${references.map((ref: any, index: number) => `<li>${escapeHtml(toIeeeReference(ref, index))}</li>`).join('')}</ol></section>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project?.title || 'Proposal')}</title>
    <style>
      body { font-family: "Times New Roman", Times, serif; color: #0f172a; line-height: 1.6; max-width: 900px; margin: 2rem auto; padding: 0 1.25rem; }
      h1, h2 { color: #0f172a; }
      .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; }
      ul, ol { padding-left: 1.25rem; }
      section { margin-bottom: 1.5rem; }
      .cover-page { min-height: 88vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding: 2rem 1rem 3rem; }
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
  const schoolSettings = await loadWorkspaceSchoolSettings();
  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('full_name,student_id,program,department')
    .eq('id', user.id)
    .maybeSingle();
  const logoUrl = await getLogoUrl(schoolSettings.logo_path);
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
  const markdown = buildProposalMarkdown(project, chapters, references);
  const html = buildProposalHtml(project, chapters, references, coverPageHtml);

  const { data: exportRow, error: exportError } = await supabaseServer
    .from('proposal_exports')
    .insert({
      project_id: id,
      format: 'html',
      file_path: `/exports/${id}.html`,
      status: 'complete',
      metadata: { markdown, html, stage: metadata.stage || 'initial_proposal', chapter_count: chapters.length, reference_count: references.length },
    })
    .select()
    .single();

  if (exportError) {
    return NextResponse.json({ error: exportError.message }, { status: 500 });
  }

  return NextResponse.json({ export: exportRow, markdown, html });
}
