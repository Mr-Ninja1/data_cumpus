import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { chunkText } from '@/utils/chunkText';
import { getTemplateRawText } from '@/utils/templateFileText';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const templateId = body.template_id as string;

  if (!templateId) return NextResponse.json({ error: 'Missing template_id' }, { status: 400 });

  try {
    const rawTextResult = await getTemplateRawText(templateId);
    if ('error' in rawTextResult) return NextResponse.json({ error: rawTextResult.error }, { status: 404 });

    const text = rawTextResult.text;
    const chunks = chunkText(text || '', 2000);

    const { error: deleteErr } = await supabaseServer
      .from('proposal_template_chunks')
      .delete()
      .eq('template_id', templateId);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    // Insert fresh chunks after clearing old ones so reindexing does not duplicate content
    const rows = chunks.map((c, i) => ({ template_id: templateId, chunk_index: i, chunk_text: c }));
    const { error: insErr } = await supabaseServer.from('proposal_template_chunks').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Optionally call embeddings worker here if GEMINI_API_KEY is present (skipped if not configured)
    if (process.env.GEMINI_API_KEY) {
      // enqueue or call embedding generation (left as a future step)
      // For now we return that embedding generation is pending
    }

    return NextResponse.json({ success: true, inserted: rows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
