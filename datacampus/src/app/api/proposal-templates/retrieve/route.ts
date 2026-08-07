import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { cosineSim, generateEmbedding } from '@/utils/embeddings';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const templateId = body.templateId;
  const query = body.query || '';
  const topK = Number(body.topK || 5);

  if (!templateId) return NextResponse.json({ error: 'Missing templateId' }, { status: 400 });
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase server client not configured' }, { status: 500 });

  // Get chunks with embeddings if available
  const { data: chunks } = await supabaseServer.from('proposal_template_chunks').select('id,chunk_text,embedding').eq('template_id', templateId);
  if (!chunks) return NextResponse.json({ error: 'No chunks found' }, { status: 404 });

  // Compute query embedding (uses external API if configured, otherwise local fallback)
  const qEmb = await generateEmbedding(query);

  if (qEmb) {
    const scored = chunks.map((c: any) => ({ id: c.id, text: c.chunk_text, score: c.embedding ? cosineSim(qEmb, c.embedding) : 0 }));
    scored.sort((a, b) => b.score - a.score);
    return NextResponse.json({ results: scored.slice(0, topK) });
  }

  // fallback: simple substring match
  const filtered = chunks.filter((c: any) => c.chunk_text.toLowerCase().includes(query.toLowerCase()));
  return NextResponse.json({ results: filtered.slice(0, topK).map((c: any) => ({ id: c.id, text: c.chunk_text, score: 0 })) });
}
