import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { supabase } from '@/utils/supabaseClient';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(_req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: sections, error: sectionsError } = await supabaseServer
    .from('proposal_sections')
    .select('*')
    .eq('project_id', id)
    .order('section_key');

  if (sectionsError) {
    return NextResponse.json({ error: sectionsError.message }, { status: 500 });
  }

  return NextResponse.json({ project, sections: sections ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { data: existingProject, error: existingError } = await supabaseServer
    .from('proposal_projects')
    .select('metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextMetadata = {
    ...(existingProject?.metadata || {}),
    ...(body.metadata || {}),
  };

  const { data, error } = await supabaseServer
    .from('proposal_projects')
    .update({
      title: body.title,
      department: body.department,
      supervisor: body.supervisor,
      academic_year: body.academic_year,
      current_step: body.current_step,
      status: body.status,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify the project belongs to this user before deleting
  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  // Delete proposal generations (all AI generation history for this project)
  if (supabaseServer) {
    await supabaseServer.from('proposal_generations').delete().eq('project_id', id);
  }

  // Delete proposal sections (dependent on project)
  if (supabaseServer) {
    await supabaseServer.from('proposal_sections').delete().eq('project_id', id);
  }

  // Also delete any uploaded files in the storage bucket for this proposal
  const { data: files } = await supabase.storage.from('papers').list(`proposals/${id}`);
  if (files && files.length > 0) {
    await supabase.storage
      .from('papers')
      .remove(files.map((f) => `proposals/${id}/${f.name}`));
  }

  // Delete the proposal project
  const { error: deleteError } = await supabaseServer
    .from('proposal_projects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
