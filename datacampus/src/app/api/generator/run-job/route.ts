import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';

export const runtime = 'nodejs';

async function safeJsonParse(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

export async function POST(req: NextRequest) {
  // Allow worker authentication via WORKER_BEARER or service JWT via Supabase
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== process.env.WORKER_BEARER) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseServer) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const jobId = body.jobId;
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  // Load job
  const { data: job, error: jobErr } = await supabaseServer.from('generator_jobs').select('*').eq('id', jobId).maybeSingle();
  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.status !== 'pending') return NextResponse.json({ error: 'Job not pending' }, { status: 400 });

  // mark in progress
  await supabaseServer.from('generator_jobs').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', jobId);

  const payload = job.payload || {};
  const projectId = payload.projectId || job.project_id;
  const sectionKey = payload.sectionKey || null;
  const credits = Number(payload.creditsToSpend || 0);

  try {
    // Fetch project
    const { data: project } = await supabaseServer.from('proposal_projects').select('*').eq('id', projectId).maybeSingle();

    // Consume credits atomically
    if (credits > 0) {
      const rpc = await supabaseServer.rpc('consume_credits', { p_user_id: job.user_id, p_amount: credits, p_description: `async:proposal:${projectId}:${jobId}`, p_metadata: { jobId } });
      if (rpc?.error) {
        await supabaseServer.from('generator_jobs').update({ status: 'failed', error_text: rpc.error.message || 'consume_credits failed', updated_at: new Date().toISOString() }).eq('id', jobId);
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }
    }

    // Load spec if available via project.metadata.spec_key
    let specText = '';
    const specKey = project?.metadata?.spec_key || payload.specKey || null;
    if (specKey) {
      const { data: spec } = await supabaseServer.from('document_specs').select('spec_md').eq('key', specKey).maybeSingle();
      if (spec) specText = spec.spec_md || '';
    }

    // RAG context if templateId present
    let retrievedContext = '';
    if (payload.templateId) {
      const { data: chunks } = await supabaseServer.from('proposal_template_chunks').select('chunk_text').eq('template_id', payload.templateId).order('chunk_index', { ascending: true }).limit(5);
      if (chunks && chunks.length) retrievedContext = chunks.map((c: any) => c.chunk_text).join('\n\n');
    }

    // 1) Outline phase (if no specific section requested)
    let outline = null;
    if (!sectionKey) {
      const system = `You are a proposal generator. Follow this spec:\n\n${specText}`;
      const userPrompt = `Produce a JSON array outline for a project titled "${project?.title || 'Untitled'}". Return an array of objects with keys: {"section_key": "cover","title":"Cover"}. Keep it concise.`;
      const resp = await runModel({ provider: process.env.MODEL_PROVIDER || 'local-stub', system, prompt: userPrompt, maxTokens: 800 });
      const parsed = safeJsonParse(String(resp).trim());
      if (parsed && Array.isArray(parsed)) outline = parsed;
    }

    // Fallback outline
    if (!outline) {
      outline = [
        { section_key: 'cover', title: 'Cover' },
        { section_key: 'background', title: 'Background' },
        { section_key: 'problem_statement', title: 'Problem Statement' },
        { section_key: 'objectives_scope', title: 'Objectives and Scope' },
        { section_key: 'architecture_stack', title: 'Architecture / Stack' },
        { section_key: 'budget_timeline', title: 'Budget and Timeline' },
      ];
    }

    const targetSections = sectionKey ? outline.filter((s: any) => s.section_key === sectionKey) : outline;
    const generations: any[] = [];

    for (const s of targetSections) {
      const userPrompt = `Write the section titled "${s.title}" for project "${project?.title || ''}". Use the spec instructions and include citations if references provided.\n\nContext:\n${retrievedContext}\n\nNotes: ${payload.promptText || ''}`;
      const sectionResp = await runModel({ provider: process.env.MODEL_PROVIDER || 'local-stub', system: specText ? `Spec:\n${specText}` : undefined, prompt: userPrompt, maxTokens: 2000 });
      const responseText = String(sectionResp);

      // upsert into proposal_generations
      const { data: gen } = await supabaseServer.from('proposal_generations').insert({ project_id: projectId, section_id: null, prompt_type: 'ai_generate', prompt_text: userPrompt, response_text: responseText, credits_spent: 0, model: process.env.MODEL_PROVIDER || 'local-stub', metadata: { jobId } }).select().single();
      if (gen) generations.push(gen);

      // update section content if exists
      await supabaseServer.from('proposal_sections').update({ content_md: responseText, updated_at: new Date().toISOString() }).match({ project_id: projectId, section_key: s.section_key });
    }

    await supabaseServer.from('generator_jobs').update({ status: 'completed', progress: 100, result: { generations }, updated_at: new Date().toISOString() }).eq('id', jobId);

    return NextResponse.json({ success: true, generations });
  } catch (err: any) {
    console.error('run-job failed', err);
    await supabaseServer.from('generator_jobs').update({ status: 'failed', error_text: String(err), updated_at: new Date().toISOString() }).eq('id', jobId);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
