import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { classifyIntent } from '@/utils/intentClassifier';

export const runtime = 'nodejs';

// This is the classification step from idea.md Section 3: every user
// message is routed through here first. Nothing else (generation, edits,
// answers) happens until the message has been classified into
// continue_generation | edit_request | question | unclear.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body.message || '');
  const currentChapterKey = body.currentChapterKey || body.currentSection || undefined;
  const currentChapterTitle = body.currentChapterTitle || undefined;
  const provider = body.provider || process.env.MODEL_PROVIDER || 'local-stub';
  const model = body.model || 'default';
  // Client-sent recent turns for resolving corrections ("no, I meant X") —
  // there's no server-side chat history table, so this has to come from
  // the caller. Capped and sanitized so a huge payload can't blow up the
  // classifier prompt.
  const recentMessages = Array.isArray(body.recentMessages)
    ? body.recentMessages
        .slice(-4)
        .map((m: { role?: string; text?: string }) => ({ role: String(m?.role || 'user'), text: String(m?.text || '').slice(0, 500) }))
        .filter((m: { text: string }) => m.text)
    : undefined;

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('id, title, department, supervisor, academic_year')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  // Fetched fresh from the DB rather than trusted from the client — this is
  // what lets the classifier correctly resolve "prepend X to the actual
  // title" instead of writing that phrase itself as the new value.
  const currentCoverPage = {
    title: project.title || undefined,
    department: project.department || undefined,
    supervisor: project.supervisor || undefined,
    academic_year: project.academic_year || undefined,
  };

  const classification = await classifyIntent({
    message,
    currentChapterKey,
    currentChapterTitle,
    provider,
    model,
    currentCoverPage,
    recentMessages,
  });
  return NextResponse.json({ classification });
}
