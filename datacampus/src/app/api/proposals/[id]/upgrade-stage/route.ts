import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { isInitialProposalReady } from '@/utils/proposalFlow';

export const runtime = 'nodejs';

const FULL_PROJECT_CHAPTERS = [
  { chapter_key: 'chapter_4', title: 'Chapter 4' },
  { chapter_key: 'chapter_5', title: 'Chapter 5' },
  { chapter_key: 'chapter_6', title: 'Chapter 6' },
];

type ChapterEntry = {
  chapter_key?: string;
  title?: string;
  content_md?: string;
  stage?: string;
  status?: string;
};

// The school only requires cover page + table of contents + Chapters 1-3 +
// references to start. Chapters 4-6 (the full project) only unlock once that
// initial proposal is actually complete, never on request alone.
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

  const metadata = (project.metadata || {}) as Record<string, unknown>;
  const chapters: ChapterEntry[] = Array.isArray(metadata.chapters) ? (metadata.chapters as ChapterEntry[]) : [];
  const references: unknown[] = Array.isArray(metadata.references) ? (metadata.references as unknown[]) : [];

  if (!isInitialProposalReady(chapters, references)) {
    return NextResponse.json(
      {
        error:
          'Finish the cover page, Chapters 1-3, and add at least one reference before continuing to the full project.',
      },
      { status: 400 }
    );
  }

  if (metadata.stage === 'full_project') {
    return NextResponse.json({ project });
  }

  const existingKeys = new Set(chapters.map((chapter) => chapter.chapter_key));
  const newChapters = FULL_PROJECT_CHAPTERS.filter((chapter) => !existingKeys.has(chapter.chapter_key));
  const nextChapters: ChapterEntry[] = [
    ...chapters,
    ...newChapters.map((chapter) => ({ ...chapter, content_md: '', stage: 'full_project', status: 'ready' })),
  ];

  if (newChapters.length) {
    const { error: sectionsError } = await supabaseServer.from('proposal_sections').insert(
      newChapters.map((chapter) => ({
        project_id: id,
        section_key: chapter.chapter_key,
        title: chapter.title,
        content_md: '',
      }))
    );
    if (sectionsError) {
      return NextResponse.json({ error: sectionsError.message }, { status: 500 });
    }
  }

  const nextMetadata = {
    ...metadata,
    stage: 'full_project',
    chapters: nextChapters,
    workflow: {
      ...((metadata.workflow as Record<string, unknown>) || {}),
      mode: metadata.workflow_mode || (metadata.workflow as Record<string, unknown>)?.mode || 'chat_to_work',
      status: 'in_progress',
      current_chapter_key: 'chapter_4',
      next_chapter_key: 'chapter_4',
      completed_chapter_keys: nextChapters
        .filter((chapter) => String(chapter.content_md || '').trim().length > 0)
        .map((chapter) => String(chapter.chapter_key || '')),
      chapter_queue: nextChapters.map((chapter) => String(chapter.chapter_key || '')),
      initial_proposal_ready: true,
      last_action: 'upgraded_to_full_project',
      updated_at: new Date().toISOString(),
    },
  };

  const { data: updated, error: updateError } = await supabaseServer
    .from('proposal_projects')
    .update({
      metadata: nextMetadata,
      current_step: 'chapter_4',
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ project: updated });
}
