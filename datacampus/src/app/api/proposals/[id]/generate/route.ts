import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { generateOrContinueChapter } from '@/utils/chapterGenerationEngine';

export const runtime = 'nodejs';

// Thin HTTP wrapper around the shared chapter-generation engine — the real
// logic (spec injection, targeted fill for incomplete chapters, completeness
// verification) lives in chapterGenerationEngine.ts so the autopilot loop
// (src/utils/autopilotEngine.ts) can call the exact same pipeline without a
// user in the loop.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sectionKey = body.sectionKey || 'chapter_1';
  const creditsToSpend = Number(body.creditsToSpend || 3);
  const provider = body.provider || process.env.MODEL_PROVIDER || 'local-stub';
  const model = body.model || 'default';

  // Legacy async path: queue onto the older, outline-based job worker
  // instead of running inline. Left untouched and separate from autopilot.
  if (process.env.ASYNC_GENERATION === 'true') {
    const { data: job, error: jobErr } = await supabaseServer
      .from('generator_jobs')
      .insert({
        user_id: user.id,
        project_id: id,
        section_key: sectionKey,
        payload: {
          promptText: body.promptText,
          creditsToSpend,
          attachments: body.attachments,
          sectionKey,
          projectId: id,
          provider,
          model,
        },
      })
      .select()
      .single();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
    return NextResponse.json({ job, status: 'queued' });
  }

  const result = await generateOrContinueChapter({
    userId: user.id,
    userEmail: user.email,
    projectId: id,
    sectionKey,
    chapterKey: body.chapterKey || sectionKey,
    chapterTitle: body.chapterTitle,
    promptText: body.promptText,
    stage: body.stage,
    creditsToSpend,
    attachments: body.attachments,
    specKey: body.specKey,
    references: body.references,
    provider,
    model,
    signal: req.signal,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  if (result.status === 'awaiting_input') {
    return NextResponse.json({ status: 'awaiting_input', question: result.question, missingInputs: result.missingInputs });
  }

  return NextResponse.json({
    responseText: result.responseText,
    balance: result.balance,
    provider,
    model,
    incomplete: result.incomplete,
    missingSections: result.missingSections,
    nextChapterKey: result.nextChapterKey,
    diagramWarnings: result.diagramWarnings,
  });
}
