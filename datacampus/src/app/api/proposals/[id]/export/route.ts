import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatContentHtml(content: string) {
  const normalized = String(content || '').replace(/\r/g, '');
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  if (!paragraphs.length) {
    return '<p>Pending chapter content.</p>';
  }

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph.replace(/\n/g, ' '))}</p>`).join('');
}

function buildProposalMarkdown(project: any, chapters: any[], references: any[]) {
  const stage = project?.metadata?.stage || 'initial_proposal';
  const stageLabel = stage === 'full_project' ? 'Full project' : 'Initial proposal';
  const chapterEntries = Array.isArray(chapters) && chapters.length
    ? chapters
    : [];

  const lines = [
    `# ${project?.title || 'Proposal'}`,
    '',
    `Stage: ${stageLabel}`,
    `Department: ${project?.department || 'Not set'}`,
    `Supervisor: ${project?.supervisor || 'Not set'}`,
    `Academic year: ${project?.academic_year || 'Not set'}`,
    '',
    '## Front matter',
    '',
    '- Cover page',
    '- Table of contents',
    ...(stage === 'full_project' ? ['- Abstract', '- Acknowledgement'] : []),
    '',
  ];

  if (chapterEntries.length) {
    chapterEntries.forEach((chapter: any) => {
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
    references.forEach((ref: any) => {
      lines.push(`- ${ref.title || ref.citation_key || 'Reference'} (${ref.author || 'Unknown'}, ${ref.year || 'n.d.'})`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

function buildProposalHtml(project: any, chapters: any[], references: any[]) {
  const stage = project?.metadata?.stage || 'initial_proposal';
  const stageLabel = stage === 'full_project' ? 'Full project' : 'Initial proposal';
  const chapterEntries = Array.isArray(chapters) && chapters.length ? chapters : [];
  const frontMatterItems = ['Cover page', 'Table of contents', ...(stage === 'full_project' ? ['Abstract', 'Acknowledgement'] : [])];
  const chapterHtml = chapterEntries.length
    ? chapterEntries.map((chapter: any) => `
      <section>
        <h2>${escapeHtml(chapter.title || chapter.chapter_key || 'Chapter')}</h2>
        ${formatContentHtml(chapter.content_md || chapter.content || 'Pending chapter content.')}
      </section>`).join('')
    : '<section><h2>Chapters</h2><p>No chapter content has been generated yet.</p></section>';

  const referencesHtml = references.length
    ? `<section><h2>References</h2><ul>${references.map((ref: any) => `<li>${escapeHtml(ref.title || ref.citation_key || 'Reference')} (${escapeHtml(ref.author || 'Unknown')}, ${escapeHtml(ref.year || 'n.d.')})</li>`).join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project?.title || 'Proposal')}</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 900px; margin: 2rem auto; padding: 0 1.25rem; }
      h1, h2 { color: #0f172a; }
      .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem; }
      ul { padding-left: 1.25rem; }
      section { margin-bottom: 1.5rem; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(project?.title || 'Proposal')}</h1>
    <div class="meta">
      <p><strong>Stage:</strong> ${escapeHtml(stageLabel)}</p>
      <p><strong>Department:</strong> ${escapeHtml(project?.department || 'Not set')}</p>
      <p><strong>Supervisor:</strong> ${escapeHtml(project?.supervisor || 'Not set')}</p>
      <p><strong>Academic year:</strong> ${escapeHtml(project?.academic_year || 'Not set')}</p>
    </div>
    <section>
      <h2>Front matter</h2>
      <ul>${frontMatterItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
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
  const markdown = buildProposalMarkdown(project, chapters, references);
  const html = buildProposalHtml(project, chapters, references);

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
