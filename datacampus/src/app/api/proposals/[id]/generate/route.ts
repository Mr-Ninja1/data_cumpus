import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';
import {
  buildChapterGenerationGuidance,
  buildLiteratureReviewContext,
  getChapterDiagramRequirements,
  hasValue,
  isInitialProposalReady,
  parseReferencesInput,
  parseRequiredInputs,
} from '@/utils/proposalFlow';
import { buildProposalStandardContext } from '@/utils/proposalStandards';
import { buildZutProposalGuardrails, SCHOOL_PROFILE } from '@/utils/schoolProfile';
import { loadWorkspaceSchoolSettings } from '@/utils/workspaceSchoolSettings';
import {
  extractMarkdownSectionForChapter,
  getChapterSpecFragment,
  getFrontOrBackMatterFragment,
  parseStructuredSpec,
} from '@/utils/proposalSpec';

type DocumentSpecRow = {
  key: string;
  spec_md?: string | null;
  spec_json?: unknown;
  title?: string | null;
  description?: string | null;
};

type ProposalReference = {
  title?: string;
  author?: string;
  year?: string | number | null;
};

type ProposalChapter = {
  chapter_key?: string;
  title?: string;
  content_md?: string;
  stage?: string;
  updated_at?: string;
};

export const runtime = 'nodejs';

function isCoverSection(sectionKey: string) {
  return ['cover', 'cover_page'].includes(sectionKey);
}

async function loadPreferredSpec() {
  if (!supabaseServer) return null;

  const schoolSettings = await loadWorkspaceSchoolSettings();
  const preferredKeys = [
    schoolSettings.default_proposal_spec_key,
    'zut-it-final-year-proposal',
    'zut-final-year-project-proposal',
    'default-proposal',
  ].filter(Boolean) as string[];

  const { data } = await supabaseServer
    .from('document_specs')
    .select('key, spec_md, spec_json, title, description')
    .in('key', preferredKeys);

  return (
    preferredKeys
      .map((key) => (data || []).find((entry: DocumentSpecRow) => entry.key === key))
      .find(Boolean) || null
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sectionKey = body.sectionKey || 'chapter_1';
  const promptText = body.promptText || 'Draft a proposal section';
  const creditsToSpend = Number(body.creditsToSpend || 3);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const provider = body.provider || process.env.MODEL_PROVIDER || 'local-stub';
  const model = body.model || 'default';

  const { data: walletData, error: walletError } = await supabaseServer
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (walletError) {
    return NextResponse.json({ error: walletError.message }, { status: 500 });
  }

  if ((walletData?.balance_credits ?? 0) < creditsToSpend) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
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

  const stage = body.stage || project?.metadata?.stage || 'initial_proposal';
  const chapterKey = body.chapterKey || sectionKey;

  const { data: section, error: sectionError } = await supabaseServer
    .from('proposal_sections')
    .select('*')
    .eq('project_id', id)
    .eq('section_key', sectionKey)
    .maybeSingle();

  if (sectionError) {
    return NextResponse.json({ error: sectionError.message }, { status: 500 });
  }

  if (process.env.ASYNC_GENERATION === 'true') {
    const { data: job, error: jobErr } = await supabaseServer
      .from('generator_jobs')
      .insert({
        user_id: user.id,
        project_id: id,
        section_key: sectionKey,
        payload: { promptText, creditsToSpend, attachments, sectionKey, projectId: id, provider, model },
      })
      .select()
      .single();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
    return NextResponse.json({ job: job, status: 'queued' });
  }

  const { data: profile } =
    (await supabaseServer
      ?.from('profiles')
      .select('full_name,student_id,program,department')
      .eq('id', user.id)
      .maybeSingle()) ?? {};

  const schoolSettings = await loadWorkspaceSchoolSettings();
  const explicitSpecKey = project?.metadata?.spec_key || body.specKey || schoolSettings.default_proposal_spec_key || null;
  const specData = explicitSpecKey
    ? await supabaseServer
        .from('document_specs')
        .select('key, spec_md, spec_json, title, description')
        .eq('key', explicitSpecKey)
        .maybeSingle()
        .then((result) => result.data || null)
    : await loadPreferredSpec();

  const specText = specData?.spec_md || '';
  const structuredSpec = parseStructuredSpec(specData?.spec_json);
  const requiredInputs = parseRequiredInputs(specText, sectionKey);

  const missingInputs = requiredInputs.filter((input) => !hasValue(project?.metadata?.[input] || body[input]));

  if (missingInputs.length > 0 && isCoverSection(sectionKey)) {
    const question = `Need a bit more detail before drafting ${chapterKey}: ${missingInputs.join(', ')}.`;
    const nextMetadata = { ...(project?.metadata || {}), stage, awaiting_input: true, pending_input_question: question };
    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    return NextResponse.json({ status: 'awaiting_input', question, missingInputs });
  }

  const existingContent = String(
    (Array.isArray(project?.metadata?.chapters)
      ? (project.metadata.chapters as ProposalChapter[]).find((chapter) => chapter.chapter_key === chapterKey)?.content_md
      : '') || section?.content_md || ''
  ).trim();

  const system = [
    `You are the academic proposal drafting assistant for ${schoolSettings.school_name || SCHOOL_PROFILE.name} (${schoolSettings.school_short_name || SCHOOL_PROFILE.shortName}).`,
    buildZutProposalGuardrails(),
    'Write polished academic content with clear headings, concise paragraphs, practical detail, and strong alignment between title, problem, objectives, and methodology.',
    'The proposal spec (structured JSON) is authoritative for required sections, their order, and what each section must contain — there is no separate sample proposal in this workflow.',
    'Prefer title-driven inference when information is sparse, but never invent unverifiable identity details or fake citations.',
    'If references were auto-found from the title, treat them as candidate evidence, not guaranteed truth. Use only the references that are clearly relevant to the current chapter and the actual project topic.',
    'Avoid placeholders and generic filler.',
    existingContent
      ? 'A current draft for this exact section is provided below. Treat this as a revision/edit request, not a fresh rewrite: keep everything the user did not ask to change, and apply exactly what they asked for. Only produce a full rewrite if the user explicitly asks to start over.'
      : 'There is no existing draft for this section yet — write a complete, submission-ready first draft.',
    'Cover page and table of contents formatting are not strictly mandated by the school — keep them professional and clean, and always prioritize honoring specific user formatting requests (layout, wording, emphasis, order) over any default styling. Chapters 1-3 content must still follow the required structure from the spec.',
  ].join('\n');

  let userPrompt = promptText;
  if (['cover', 'cover_page'].includes(sectionKey)) {
    const studentName = profile?.full_name || user.email || '';
    const studentId = profile?.student_id || '';
    const logoHint = schoolSettings.logo_path ? ` Use the stored school logo asset at ${schoolSettings.logo_path}.` : '';
    userPrompt = `Create a cover page for project titled "${project.title}". Student: ${studentName} (${studentId}). Supervisor: ${project.supervisor || ''}. Include the school logo on top and match the uploaded school cover-page style.${logoHint}` + (promptText ? `\nAdditional notes: ${promptText}` : '');
  }

  const referencesPayload: ProposalReference[] = Array.isArray(project?.metadata?.references)
    ? (project.metadata.references as ProposalReference[])
    : [];
  const referencesContext = referencesPayload.length
    ? [
        'Reference list (use selectively and only when clearly relevant to the project title/section):',
        ...referencesPayload.map((ref) => `- ${ref.title} (${ref.author || 'Unknown'}, ${ref.year || 'n.d.'})`),
        'Do not force every reference into the chapter. Use only the ones that actually fit the argument, and ignore weak or irrelevant matches.',
        'If the available references are shallow, say less rather than inventing evidence.',
      ].join('\n')
    : 'No references supplied yet. If the user did not provide references, do not fabricate source details.';
  const chapterDiagramRequirements = getChapterDiagramRequirements(stage, chapterKey);
  const diagramGuidance = chapterDiagramRequirements.length
    ? `Required diagram(s) for this section: ${chapterDiagramRequirements.join('; ')}.`
    : '';
  const chapterGuidance = buildChapterGenerationGuidance(stage, chapterKey, project.title);
  const standardsContext = buildProposalStandardContext(
    {
      title: project.title,
      department: project.department || profile?.department || null,
      supervisor: project.supervisor,
      academic_year: project.academic_year,
    },
    chapterKey
  );
  const literatureReviewGuidance =
    chapterKey === 'chapter_1' ? `\n\n${buildLiteratureReviewContext(project.title, project.department || '', referencesPayload)}` : '';
  const missingInputGuidance = missingInputs.length
    ? `Preferred but missing inputs: ${missingInputs.join(', ')}. Infer carefully from the title and ZUT examples where possible, and leave out unsupported personal/admin details.`
    : '';

  // Only pull the fragment of the spec relevant to the current section, not
  // the whole guide. Structured specs (spec_json) are preferred; for legacy
  // markdown specs, extract just the matching heading's block instead of
  // injecting the entire document.
  const structuredFragment = isCoverSection(sectionKey)
    ? getFrontOrBackMatterFragment(structuredSpec, 'cover_page')
    : getChapterSpecFragment(structuredSpec, chapterKey);
  const specFragment = structuredFragment || (specText ? extractMarkdownSectionForChapter(specText, chapterKey) : '');
  const specGuidance = specFragment
    ? `Document spec${specData?.title ? ` (${specData.title})` : ''}:\n${specFragment}\n\n`
    : '';

  const existingContentBlock = existingContent
    ? `Current existing draft for this section (revise this based on the user's request below; preserve what was not asked to change):\n"""\n${existingContent}\n"""\n\n`
    : '';

  const modelInput = `${specGuidance}${standardsContext}\n\n${referencesContext}\n\n${diagramGuidance ? `${diagramGuidance}\n\n` : ''}${chapterGuidance}\n\n${missingInputGuidance}${literatureReviewGuidance}\n\n${existingContentBlock}User request:\n${userPrompt}`;

  let txId: string | null = null;
  try {
    const rpc = await supabaseServer.rpc('consume_credits', {
      p_user_id: user.id,
      p_amount: creditsToSpend,
      p_description: `proposal_generation:${id}:${sectionKey}`,
      p_metadata: { project_id: id, sectionKey, provider, model },
    });
    if (rpc?.error) throw rpc.error;
    if (rpc?.data) txId = rpc.data;
  } catch (rpcErr: unknown) {
    const message = rpcErr instanceof Error ? rpcErr.message : 'Failed to deduct credits';
    return NextResponse.json({ error: message }, { status: 402 });
  }

  let modelResponse = '';
  try {
    modelResponse = await runModel({
      provider,
      model,
      system,
      messages: [{ role: 'user', content: modelInput }],
      maxTokens: 1500,
    });
  } catch (mErr: unknown) {
    const message = mErr instanceof Error ? mErr.message : 'Model error';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const responseText = String(modelResponse);

  const references = Array.isArray(body.references) ? body.references : [];
  const existingChapters: ProposalChapter[] = Array.isArray(project?.metadata?.chapters)
    ? (project.metadata.chapters as ProposalChapter[])
    : [];
  const nextChapters = existingChapters.filter((chapter) => chapter.chapter_key !== chapterKey);
  nextChapters.push({
    chapter_key: chapterKey,
    title: body.chapterTitle || `Chapter ${chapterKey.replace(/chapter_/g, '')}`,
    content_md: responseText,
    stage,
    updated_at: new Date().toISOString(),
  });

  const chapterOrder = Array.isArray(project?.metadata?.chapters)
    ? (project.metadata.chapters as ProposalChapter[]).map((chapter) => chapter.chapter_key).filter(Boolean)
    : [];
  const completedChapterKeys = nextChapters
    .filter((chapter) => String(chapter.content_md || '').trim().length > 0)
    .map((chapter) => String(chapter.chapter_key || ''))
    .filter(Boolean);
  const nextPendingChapterKey = chapterOrder.find((key) => key && !completedChapterKeys.includes(key)) || null;
  const nextReferences = references.length
    ? [...referencesPayload, ...parseReferencesInput(references.join('\n'))]
    : referencesPayload;
  const initialProposalReady = isInitialProposalReady(nextChapters, nextReferences);

  const nextMetadata = {
    ...(project?.metadata || {}),
    stage,
    chapters: nextChapters,
    references: nextReferences,
    awaiting_input: false,
    pending_input_question: null,
    school: schoolSettings.school_name || SCHOOL_PROFILE.name,
    school_short_name: schoolSettings.school_short_name || SCHOOL_PROFILE.shortName,
    last_generation_provider: provider,
    last_generation_model: model,
    workflow: {
      ...((project?.metadata?.workflow as Record<string, unknown> | undefined) || {}),
      mode: project?.metadata?.workflow_mode || 'classic',
      status: nextPendingChapterKey ? 'in_progress' : 'complete',
      current_chapter_key: chapterKey,
      next_chapter_key: nextPendingChapterKey,
      completed_chapter_keys: completedChapterKeys,
      chapter_queue: chapterOrder,
      initial_proposal_ready: initialProposalReady,
      last_action: 'chapter_generated',
      updated_at: new Date().toISOString(),
    },
  };

  await supabaseServer
    .from('proposal_projects')
    .update({
      metadata: nextMetadata,
      current_step: nextPendingChapterKey || chapterKey,
      status: nextPendingChapterKey ? 'in_progress' : 'complete',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  const { data: inserted, error: insertError } = await supabaseServer
    .from('proposal_generations')
    .insert({
      project_id: id,
      section_id: section?.id ?? null,
      prompt_type: 'ai_generate',
      prompt_text: promptText,
      response_text: responseText,
      credits_spent: creditsToSpend,
      model: `${provider}:${model}`,
      metadata: {
        attachments,
        spec_key: specData?.key || explicitSpecKey || 'default-proposal',
        rpc_tx: txId,
      },
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (section) {
    await supabaseServer
      .from('proposal_sections')
      .update({
        content_md: responseText,
        updated_at: new Date().toISOString(),
      })
      .eq('id', section.id);
  }

  return NextResponse.json({
    generation: inserted,
    responseText,
    balance: (walletData?.balance_credits ?? 0) - creditsToSpend,
    provider,
    model,
  });
}
