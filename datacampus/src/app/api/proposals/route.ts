import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { loadWorkspaceSchoolSettings } from '@/utils/workspaceSchoolSettings';
import { runModel } from '@/utils/models';
import { discoverReferencesForTitle } from '@/utils/referenceDiscovery';
import { refineProjectTitle } from '@/utils/projectTitle';
import { getRequiredFrontMatter } from '@/utils/proposalTools';

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

async function generateInitialCoverPage(
  project: Record<string, unknown>,
  schoolSettings: Awaited<ReturnType<typeof loadWorkspaceSchoolSettings>>,
  profile: { full_name?: string | null; student_id?: string | null; program?: string | null; department?: string | null } | null
) {
  const logoHint = schoolSettings.logo_path ? ` Use the stored school logo asset at ${schoolSettings.logo_path}.` : '';
  const studentName = String(profile?.full_name || '').trim();
  const studentId = String(profile?.student_id || '').trim();
  const department = String(project.department || profile?.department || profile?.program || schoolSettings.default_program || '').trim();
  const supervisor = String(project.supervisor || '').trim();
  const academicYear = String(project.academic_year || '').trim();
  const prompt = `Create a polished academic cover page for the final year project proposal titled "${String(project.title || 'Untitled Proposal')}" at ${schoolSettings.school_name}.${logoHint}

Use a layout close to this order:
1. school logo
2. full school name
3. school/program line
4. project title
5. by-line
6. student full name if available
7. student number if available
8. supervisor if available
9. Ndola, Zambia
10. year if available

Known details:
- student_name: ${studentName || 'not available'}
- student_id: ${studentId || 'not available'}
- department/program: ${department || 'not available'}
- supervisor: ${supervisor || 'not available'}
- academic_year: ${academicYear || 'not available'}

Output only clean cover-page text, with line breaks, no commentary.`;

  const system = [
    `You are the academic proposal drafting assistant for ${schoolSettings.school_name} (${schoolSettings.school_short_name}).`,
    'Produce clean cover page content only.',
    'Use the provided student name and student ID if available.',
    'Do not invent missing personal details like supervisor names or student IDs.',
  ].join('\n');

  return runModel({
    provider: process.env.MODEL_PROVIDER || 'local-stub',
    model: 'default',
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 900,
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const stage = body.stage === 'full_project' ? 'full_project' : 'initial_proposal';
  const workflowMode = body.workflow_mode === 'chat_to_work' ? 'chat_to_work' : 'classic';
  const schoolSettings = await loadWorkspaceSchoolSettings();

  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const titleRefinement = rawTitle ? await refineProjectTitle(rawTitle) : null;
  const finalTitle = titleRefinement?.title || rawTitle || 'Untitled Proposal';
  const chapterDefs =
    stage === 'full_project'
      ? [
          { chapter_key: 'cover_page', title: 'Cover page' },
          { chapter_key: 'chapter_1', title: 'Chapter 1' },
          { chapter_key: 'chapter_2', title: 'Chapter 2' },
          { chapter_key: 'chapter_3', title: 'Chapter 3' },
          { chapter_key: 'chapter_4', title: 'Chapter 4' },
          { chapter_key: 'chapter_5', title: 'Chapter 5' },
          { chapter_key: 'chapter_6', title: 'Chapter 6' },
        ]
      : [
          { chapter_key: 'cover_page', title: 'Cover page' },
          { chapter_key: 'chapter_1', title: 'Chapter 1' },
          { chapter_key: 'chapter_2', title: 'Chapter 2' },
          { chapter_key: 'chapter_3', title: 'Chapter 3' },
        ];

  const { data, error } = await supabaseServer
    .from('proposal_projects')
    .insert({
      user_id: user.id,
      title: finalTitle,
      department: body.department || schoolSettings.default_program || null,
      supervisor: body.supervisor || null,
      academic_year: body.academic_year || null,
      current_step: body.current_step || 'cover_page',
      status: 'draft',
      metadata: {
        stage,
        workflow_mode: workflowMode,
        doc_type: 'project_proposal',
        // Ordered array, not hardcoded positions — this is what
        // update_front_matter_order edits, and what assembleDocument reads.
        front_matter_order: getRequiredFrontMatter(stage),
        original_title: titleRefinement?.wasRefined ? titleRefinement.originalTitle : undefined,
        title_refined: Boolean(titleRefinement?.wasRefined),
        chapters: chapterDefs.map((chapter, index) => ({
          ...chapter,
          content_md: '',
          stage,
          status: index === 0 ? 'ready' : 'pending',
        })),
        references: [],
        spec_key: schoolSettings.default_proposal_spec_key || 'zut-it-final-year-proposal',
        school: schoolSettings.school_name,
        school_short_name: schoolSettings.school_short_name,
        reference_lookup: null,
        workflow: {
          mode: workflowMode,
          status: 'ready',
          current_chapter_key: body.current_step || 'cover_page',
          next_chapter_key: chapterDefs[0]?.chapter_key || 'cover_page',
          completed_chapter_keys: [],
          chapter_queue: chapterDefs.map((chapter) => chapter.chapter_key),
          last_action: 'project_created',
        },
      },
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Keep proposal_sections aligned with the chapter model used by the UI / generate route.
  const { error: sectionsError } = await supabaseServer.from('proposal_sections').insert(
    chapterDefs.map((chapter) => ({
      project_id: data.id,
      section_key: chapter.chapter_key,
      title: chapter.title,
      content_md: '',
    }))
  );

  if (sectionsError) {
    return NextResponse.json({ error: sectionsError.message, project: data }, { status: 500 });
  }

  const { data: profile } =
    (await supabaseServer
      ?.from('profiles')
      .select('full_name,student_id,program,department')
      .eq('id', user.id)
      .maybeSingle()) ?? {};

  const autoStart = workflowMode === 'chat_to_work';
  if (!autoStart) {
    return NextResponse.json({
      project: data,
      title_refined: Boolean(titleRefinement?.wasRefined),
      original_title: titleRefinement?.wasRefined ? titleRefinement.originalTitle : undefined,
    });
  }

  const referencesResult = await discoverReferencesForTitle(String(data.title || ''));
  let coverPageText = '';
  try {
    coverPageText = String(await generateInitialCoverPage(data as Record<string, unknown>, schoolSettings, profile || null));
  } catch {
    coverPageText = '';
  }

  const nextChapters = chapterDefs.map((chapter, index) => ({
    ...chapter,
    content_md: chapter.chapter_key === 'cover_page' ? coverPageText : '',
    stage,
    status:
      chapter.chapter_key === 'cover_page' && coverPageText
        ? 'complete'
        : chapter.chapter_key === 'chapter_1'
          ? 'ready'
          : index === 0
            ? 'ready'
            : 'pending',
    updated_at: chapter.chapter_key === 'cover_page' && coverPageText ? new Date().toISOString() : undefined,
  }));

  const nextMetadata = {
    ...(data.metadata as Record<string, unknown>),
    chapters: nextChapters,
    references: referencesResult.references,
    reference_lookup: referencesResult.lookup,
    workflow: {
      ...(((data.metadata as Record<string, unknown>)?.workflow as Record<string, unknown>) || {}),
      mode: workflowMode,
      status: 'in_progress',
      current_chapter_key: coverPageText ? 'cover_page' : 'chapter_1',
      next_chapter_key: 'chapter_1',
      completed_chapter_keys: coverPageText ? ['cover_page'] : [],
      chapter_queue: chapterDefs.map((chapter) => chapter.chapter_key),
      last_action: 'auto_started_after_title',
      updated_at: new Date().toISOString(),
    },
  };

  await supabaseServer
    .from('proposal_projects')
    .update({
      metadata: nextMetadata,
      current_step: 'chapter_1',
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id)
    .eq('user_id', user.id);

  if (coverPageText) {
    await supabaseServer
      .from('proposal_sections')
      .update({ content_md: coverPageText, updated_at: new Date().toISOString() })
      .eq('project_id', data.id)
      .eq('section_key', 'cover_page');

    await supabaseServer.from('proposal_generations').insert({
      project_id: data.id,
      section_id: null,
      prompt_type: 'auto_generate_cover_page',
      prompt_text: 'Auto-generated after title entry',
      response_text: coverPageText,
      credits_spent: 0,
      model: `${process.env.MODEL_PROVIDER || 'local-stub'}:default`,
      metadata: {
        auto_started: true,
        reference_lookup_status: referencesResult.lookup.status,
      },
    });
  }

  const { data: refreshedProject } = await supabaseServer
    .from('proposal_projects')
    .select('*')
    .eq('id', data.id)
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    project: refreshedProject || data,
    auto_started: true,
    next_step: 'chapter_1',
    reference_lookup: referencesResult.lookup,
    generated_cover_page: Boolean(coverPageText),
    title_refined: Boolean(titleRefinement?.wasRefined),
    original_title: titleRefinement?.wasRefined ? titleRefinement.originalTitle : undefined,
  });
}
