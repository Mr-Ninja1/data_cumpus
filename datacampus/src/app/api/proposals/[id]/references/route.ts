import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { parseReferencesInput } from '@/utils/proposalFlow';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rawReferences = Array.isArray(body.references) ? body.references : [];
  const parsed = parseReferencesInput(rawReferences.join('\n'));

  const { data: project } = await supabaseServer.from('proposal_projects').select('metadata').eq('id', id).eq('user_id', user.id).maybeSingle();
  const currentMetadata = (project?.metadata || {}) as Record<string, any>;
  const currentReferences = Array.isArray(currentMetadata.references) ? currentMetadata.references : [];

  const nextReferences = [...currentReferences, ...parsed];
  const { data, error } = await supabaseServer.from('proposal_projects').update({ metadata: { ...currentMetadata, references: nextReferences }, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data, references: nextReferences });
}
