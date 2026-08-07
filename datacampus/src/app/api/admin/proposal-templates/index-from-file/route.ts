import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { chunkText } from '@/utils/chunkText';
import { extractTextFromFile } from '@/utils/extractTextFromFile';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req as any);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const templateId = body.template_id as string;

  if (!templateId) return NextResponse.json({ error: 'Missing template_id' }, { status: 400 });

  // Fetch template record
  const { data: tmpl, error: tmplErr } = await supabaseServer.from('proposal_templates').select('file_path').eq('id', templateId).maybeSingle();
  if (tmplErr || !tmpl || !tmpl.file_path) return NextResponse.json({ error: 'Template not found or missing file_path' }, { status: 404 });

  try {
    const { data: download, error: dlErr } = await supabaseServer.storage.from('proposal_templates').download(tmpl.file_path);
    if (dlErr || !download) return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 500 });

    const buffer = await download.arrayBuffer();
    // Use extractor for PDFs/DOCX/etc
    const text = await extractTextFromFile(buffer, tmpl.file_path || 'file.txt');
    const chunks = chunkText(text || '', 2000);

    // Insert chunks
    const rows = chunks.map((c, i) => ({ template_id: templateId, chunk_index: i, chunk_text: c }));
    const { error: insErr } = await supabaseServer.from('proposal_template_chunks').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Optionally call embeddings worker here if GEMINI_API_KEY is present (skipped if not configured)
    if (process.env.GEMINI_API_KEY) {
      // enqueue or call embedding generation (left as a future step)
      // For now we return that embedding generation is pending
    }

    return NextResponse.json({ success: true, inserted: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
