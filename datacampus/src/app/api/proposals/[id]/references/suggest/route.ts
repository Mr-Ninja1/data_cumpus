import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { discoverReferencesForTitle, mergeReferencesPreservingOrder } from '@/utils/referenceDiscovery';

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
  const mergedReferences = mergeReferencesPreservingOrder(currentReferences as any[], references as any[]);

  const nextMetadata = {
    ...metadata,
    references: mergedReferences,
    reference_lookup: {
      ...lookup,
      message: currentReferences.length && mergedReferences.length > currentReferences.length
        ? `${lookup.message} Kept your existing reference order and appended ${mergedReferences.length - currentReferences.length} new reference${mergedReferences.length - currentReferences.length === 1 ? '' : 's'} to avoid renumbering existing citations.`
        : currentReferences.length
          ? `${lookup.message} Existing reference order was preserved to avoid renumbering citations already used in drafted chapters.`
          : lookup.message,
    },
  };

  await supabaseServer
    .from('proposal_projects')
    .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  const status = lookup.status === 'failed' ? 500 : 200;
  return NextResponse.json({ references: mergedReferences, message: nextMetadata.reference_lookup.message, status: lookup.status }, { status });
}
