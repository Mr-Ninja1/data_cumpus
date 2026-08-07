import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';
import { buildChapterGenerationGuidance, buildLiteratureReviewContext, getStageDefinition, hasValue, parseReferencesInput, parseRequiredInputs } from '@/utils/proposalFlow';

export const runtime = 'nodejs';

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
  const templateId = body.templateId || null;

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

  const { error: updateError } = await supabaseServer
    .from('wallets')
    .upsert({ user_id: user.id, balance_credits: (walletData?.balance_credits ?? 0) - creditsToSpend, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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

  // If ASYNC_GENERATION is enabled, enqueue a job and return the job id
  if (process.env.ASYNC_GENERATION === 'true') {
    const { data: job, error: jobErr } = await supabaseServer
      .from('generator_jobs')
      .insert({ user_id: user.id, project_id: id, section_key: sectionKey, payload: { promptText, creditsToSpend, attachments, templateId, sectionKey, projectId: id } })
      .select()
      .single();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
    return NextResponse.json({ job: job, status: 'queued' });
  }

  // RAG: fetch template chunks if a template is selected
  let retrievedContext = '';
  if (templateId) {
    const { data: chunks } = await supabaseServer
      .from('proposal_template_chunks')
      .select('chunk_text')
      .eq('template_id', templateId)
      .order('chunk_index', { ascending: true })
      .limit(5);
    if (chunks && chunks.length) {
      retrievedContext = chunks.map((c: any) => c.chunk_text).join('\n\n');
    }
  }

  // Fetch profile to autofill cover page
  const { data: profile } = await supabaseServer?.from('profiles').select('full_name,student_id,program,department').eq('id', user.id).maybeSingle() ?? {};

  // Build system/messages for the model
  const specKey = project?.metadata?.spec_key || body.specKey || 'default-proposal';
  const { data: specData } = await supabaseServer.from('document_specs').select('spec_md, title, description').eq('key', specKey).maybeSingle();
  const specText = specData?.spec_md || '';
  const requiredInputs = parseRequiredInputs(specText, sectionKey);
  const missingInputs = requiredInputs.filter((input) => !hasValue(project?.metadata?.[input] || body[input]));
  if (missingInputs.length > 0) {
    const question = `Need a bit more detail before drafting ${chapterKey}: ${missingInputs.join(', ')}.`;
    const nextMetadata = { ...(project?.metadata || {}), stage, awaiting_input: true, pending_input_question: question };
    await supabaseServer.from('proposal_projects').update({ metadata: nextMetadata, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
    return NextResponse.json({ status: 'awaiting_input', question, missingInputs });
  }

  const system = `You are an academic assistant that drafts project proposals following the supplied document spec. Write polished academic content with clear headings, concise paragraphs, and practical detail. When generating a cover page, include the student's full name and student id if available. Avoid placeholders and generic filler.`;
  let userPrompt = promptText;
  if (sectionKey === 'cover') {
    const studentName = profile?.full_name || user.email || '';
    const studentId = profile?.student_id || '';
    userPrompt = `Create a cover page for project titled "${project.title}". Student: ${studentName} (${studentId}). Supervisor: ${project.supervisor || ''}. Include school logo on top.` + (promptText ? `\nAdditional notes: ${promptText}` : '');
  }

  const referencesPayload = Array.isArray(project?.metadata?.references) ? project.metadata.references : [];
  const referencesContext = referencesPayload.length ? `Reference list:\n${referencesPayload.map((ref: any) => `- ${ref.title} (${ref.author || 'Unknown'}, ${ref.year || 'n.d.'})`).join('\n')}` : 'No references supplied yet.';
  const stageDefinition = getStageDefinition(stage, project.title, project.department || '');
  const diagramGuidance = `Stage diagram requirements: ${stageDefinition.required_diagrams.join(', ')}.`;
  const chapterGuidance = buildChapterGenerationGuidance(stage, chapterKey, project.title);
  const literatureReviewGuidance = chapterKey === 'chapter_1' ? `\n\n${buildLiteratureReviewContext(project.title, project.department || '', referencesPayload)}` : '';
  const modelInput = `${specText ? `Document spec:\n${specText}\n\n` : ''}${retrievedContext ? `Retrieved template context:\n${retrievedContext}\n\n` : ''}${referencesContext}\n\n${diagramGuidance}\n\n${chapterGuidance}\n\n${literatureReviewGuidance}\n\nUser request:\n${userPrompt}`;

  // Try to consume credits via RPC if available (atomic)
  let txId: string | null = null;
  try {
    if (supabaseServer) {
      const rpc = await supabaseServer.rpc('consume_credits', {
        p_user_id: user.id,
        p_amount: creditsToSpend,
        p_description: `proposal_generation:${id}:${sectionKey}`,
        p_metadata: { project_id: id, sectionKey },
      });
      // rpc returns data with id when successful; shape may differ across Postgres clients
      if (rpc?.error) throw rpc.error;
      if (rpc?.data) txId = rpc.data;
    }
  } catch (rpcErr: any) {
    return NextResponse.json({ error: rpcErr?.message || 'Failed to deduct credits' }, { status: 402 });
  }

  // Call model (Gemini or stub)
  let modelResponse = '';
  try {
    modelResponse = await runModel({ provider: process.env.MODEL_PROVIDER || 'local-stub', model: body.model || 'default', system, messages: [{ role: 'user', content: modelInput }], maxTokens: 1500 });
  } catch (mErr: any) {
    return NextResponse.json({ error: mErr?.message || 'Model error' }, { status: 500 });
  }

  const responseText = String(modelResponse);

  const references = Array.isArray(body.references) ? body.references : [];
  const existingChapters = Array.isArray(project?.metadata?.chapters) ? project.metadata.chapters : [];
  const nextChapters = existingChapters.filter((chapter: any) => chapter.chapter_key !== chapterKey);
  nextChapters.push({
    chapter_key: chapterKey,
    title: body.chapterTitle || `Chapter ${chapterKey.replace(/chapter_/g, '')}`,
    content_md: responseText,
    stage,
    updated_at: new Date().toISOString(),
  });

  const nextMetadata = {
    ...(project?.metadata || {}),
    stage,
    chapters: nextChapters,
    references: references.length ? [...referencesPayload, ...parseReferencesInput(references.join('\n'))] : referencesPayload,
    awaiting_input: false,
    pending_input_question: null,
  };

  await supabaseServer.from('proposal_projects').update({ metadata: nextMetadata, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);

  const { data: inserted, error: insertError } = await supabaseServer
    .from('proposal_generations')
    .insert({
      project_id: id,
      section_id: section?.id ?? null,
      prompt_type: 'ai_generate',
      prompt_text: promptText,
      response_text: responseText,
      credits_spent: creditsToSpend,
      model: 'local-stub',
      metadata: { attachments, retrievedContext, template_id: templateId, rpc_tx: txId },
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (section) {
    await supabaseServer.from('proposal_sections').update({
      content_md: responseText,
      updated_at: new Date().toISOString(),
    }).eq('id', section.id);
  }

  await supabaseServer.from('wallet_transactions').insert({
    user_id: user.id,
    kind: 'spend',
    credits_delta: -creditsToSpend,
    cash_amount: 0,
    currency: 'TZS',
    status: 'completed',
    provider: 'proposal-ai',
    reference: inserted?.id ?? null,
    metadata: { sectionKey },
  });

  return NextResponse.json({ generation: inserted, responseText, balance: (walletData?.balance_credits ?? 0) - creditsToSpend });
}
