import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { discoverReferencesForTitle } from '@/utils/referenceDiscovery';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const force = body.force === true;

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('id,title,department,metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const metadata = (project.metadata || {}) as Record<string, unknown>;
  const currentReferences = Array.isArray(metadata.references) ? metadata.references : [];
  if (currentReferences.length && !force) {
    return NextResponse.json({ references: currentReferences, message: 'References already added.' });
  }

  const { references, lookup } = await discoverReferencesForTitle(String(project.title || ''));

  const nextMetadata = {
    ...metadata,
    references,
    reference_lookup: lookup,
  };

  await supabaseServer
    .from('proposal_projects')
    .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  const status = lookup.status === 'failed' ? 500 : 200;
  return NextResponse.json({ references, message: lookup.message, status: lookup.status }, { status });
}
