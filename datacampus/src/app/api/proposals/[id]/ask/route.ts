import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';

export const runtime = 'nodejs';

type ChapterEntry = { chapter_key?: string; title?: string; content_md?: string };

// Handles the `question` intent from idea.md Section 3: conversational
// answer only, no tool call, no document mutation, no credit charge.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body.message || '').trim();
  const provider = body.provider || process.env.MODEL_PROVIDER || 'local-stub';
  const model = body.model || 'default';

  if (!message) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 });
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
  const chapterSummary = chapters
    .map((chapter) => `${chapter.chapter_key}: ${String(chapter.content_md || '').slice(0, 200).trim() || '(empty)'}`)
    .join('\n');

  const system = [
    'You are the assistant for an academic proposal-writing workspace.',
    "Answer the user's question conversationally. Do not draft or rewrite any document section, and do not claim to have made any changes — this is a question, not an edit request.",
    'If the question is really asking for a document change, say so plainly and suggest they phrase it as an instruction instead (e.g. "change the cover page to ..." or "make 1.2 more concise").',
  ].join('\n');

  const userPrompt = [
    `Project: "${project.title}" (stage: ${String(metadata.stage || 'initial_proposal')})`,
    chapterSummary ? `Drafted so far:\n${chapterSummary}` : 'Nothing has been drafted yet.',
    '',
    `Question: ${message}`,
  ].join('\n');

  let reply = '';
  try {
    reply = String(
      await runModel({ provider, model, system, messages: [{ role: 'user', content: userPrompt }], maxTokens: 600 })
    );
  } catch (err: unknown) {
    const messageText = err instanceof Error ? err.message : 'Model error';
    return NextResponse.json({ error: messageText }, { status: 500 });
  }

  return NextResponse.json({ reply: reply.trim() });
}
