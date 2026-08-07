import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { generateEmbedding } from '@/utils/embeddings';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req as any);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch template chunks that do not have embeddings
  const { data: chunks, error } = await supabaseServer.from('proposal_template_chunks').select('id,chunk_text').is('embedding', null).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updates: any[] = [];
  for (const c of chunks ?? []) {
    try {
      const emb = await generateEmbedding(c.chunk_text);
      if (emb) {
        updates.push({ id: c.id, embedding: emb });
      }
    } catch (err) {
      console.error('Embedding failed for chunk', c.id, err);
    }
  }

  if (updates.length) {
    // update rows in a loop (could be batched)
    for (const u of updates) {
      await supabaseServer.from('proposal_template_chunks').update({ embedding: u.embedding }).eq('id', u.id);
    }
  }

  return NextResponse.json({ success: true, processed: updates.length, total: chunks?.length ?? 0 });
}
