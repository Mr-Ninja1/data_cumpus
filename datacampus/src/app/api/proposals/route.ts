import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('proposal_projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { data, error } = await supabaseServer
    .from('proposal_projects')
    .insert({
      user_id: user.id,
      title: body.title || 'Untitled Proposal',
      department: body.department || null,
      supervisor: body.supervisor || null,
      academic_year: body.academic_year || null,
      current_step: body.current_step || 'chapter_1',
      metadata: {
        stage: body.stage || 'initial_proposal',
        chapters: [
          { chapter_key: 'chapter_1', title: 'Chapter 1', content_md: '', stage: body.stage || 'initial_proposal' },
          { chapter_key: 'chapter_2', title: 'Chapter 2', content_md: '', stage: body.stage || 'initial_proposal' },
          { chapter_key: 'chapter_3', title: 'Chapter 3', content_md: '', stage: body.stage || 'initial_proposal' },
        ],
        references: [],
      },
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sections = [
    { section_key: 'cover', title: 'Cover', content_md: '' },
    { section_key: 'background', title: 'Background', content_md: '' },
    { section_key: 'problem_statement', title: 'Problem Statement', content_md: '' },
    { section_key: 'objectives_scope', title: 'Objectives and Scope', content_md: '' },
    { section_key: 'architecture_stack', title: 'Architecture / Stack', content_md: '' },
    { section_key: 'budget_timeline', title: 'Budget and Timeline', content_md: '' },
  ];

  await supabaseServer.from('proposal_sections').insert(
    sections.map((section) => ({
      project_id: data.id,
      section_key: section.section_key,
      title: section.title,
      content_md: section.content_md,
    }))
  );

  return NextResponse.json({ project: data });
}
