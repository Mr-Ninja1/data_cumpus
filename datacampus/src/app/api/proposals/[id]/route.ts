import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

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
