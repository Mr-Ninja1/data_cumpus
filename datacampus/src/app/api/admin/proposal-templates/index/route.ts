import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Accepts: { template_id: string, chunks: [{ chunk_index: number, chunk_text: string }] }
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req as any);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const templateId = body.template_id;
  const chunks = Array.isArray(body.chunks) ? body.chunks : [];

  if (!templateId || chunks.length === 0) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  // Insert chunks (no embeddings yet)
  const rows = chunks.map((c: any) => ({ template_id: templateId, chunk_index: c.chunk_index ?? 0, chunk_text: c.chunk_text ?? '', embedding: c.embedding ?? null }));

  const { error } = await supabaseServer.from('proposal_template_chunks').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, inserted: rows.length });
}
